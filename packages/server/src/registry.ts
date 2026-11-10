import { statSync } from 'node:fs';
import path from 'node:path';
import { executeTool } from './executor.ts';
import type { LoadedTool, ToolDefinition, ToolSource, TrodPaths } from './types.ts';
import { checkExpectation, hashTool, listToolEntries, loadToolEntry } from './validate.ts';

export interface RegistryOptions {
  paths: TrodPaths;
  execAllowed: boolean;
  sessionId?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RegistryChange {
  added: string[];
  updated: string[];
  removed: string[];
  /** Folders that became invalid or whose errors changed. */
  invalid: string[];
  /** True when the tool list the client sees (names, descriptions, schemas) changed. */
  listChanged: boolean;
}

export function describeForClient(def: ToolDefinition, tool?: Pick<LoadedTool, 'source'>): string {
  let text = `${def.description.trim()}\n\nWhen to use: ${def.whenToUse.trim()}`;
  if (tool?.source === 'library') text += '\n\nLibrary tool, promoted from an earlier session. Call it directly; there is no need to read its source.';
  return text;
}

function listingSignature(tools: Map<string, LoadedTool>): string {
  return JSON.stringify(
    [...tools.values()]
      .map((t) => [t.def!.name, describeForClient(t.def!, t), t.def!.inputSchema])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

/**
 * The set of tools under .trod/library and .trod/tools. A session tool shadows a library tool
 * of the same name (that is how a library tool is changed in a session before re-promoting it).
 */
export class Registry {
  /** Valid tools by name: what the client sees. */
  active = new Map<string, LoadedTool>();
  /** Every folder by "source/folder", valid or not. */
  folders = new Map<string, LoadedTool>();
  private cache = new Map<string, LoadedTool>();
  private chain: Promise<unknown> = Promise.resolve();
  private opts: RegistryOptions;

  constructor(opts: RegistryOptions) {
    this.opts = opts;
  }

  /** A cheap signature of the tool folders (paths, sizes, mtimes) to detect changes by polling. */
  fingerprint(): string {
    const parts: string[] = [];
    for (const root of [this.opts.paths.libraryDir, this.opts.paths.toolsDir]) {
      for (const dir of listToolEntries(root)) {
        if (dir.endsWith('.mjs')) {
          try {
            const s = statSync(dir);
            parts.push(`${dir}:${s.size}:${s.mtimeMs}`);
          } catch {
            // removed meanwhile
          }
          continue;
        }
        for (const file of ['tool.json', 'run.mjs', 'run.sh']) {
          try {
            const s = statSync(path.join(dir, file));
            parts.push(`${dir}/${file}:${s.size}:${s.mtimeMs}`);
          } catch {
            // missing file
          }
        }
        parts.push(dir);
      }
    }
    return parts.join('|');
  }

  /** Resolves when no rescan is running: a call that arrives during one waits for the tool's new version. */
  idle(): Promise<void> {
    return this.chain.then(() => undefined);
  }

  /** Rescans both roots. Calls are serialized; each returns what changed since the previous one. */
  reload(): Promise<RegistryChange> {
    const run = this.chain.then(() => this.doReload());
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async doReload(): Promise<RegistryChange> {
    const { paths } = this.opts;
    const before = new Map(this.active);
    const beforeFolders = new Map(this.folders);
    const beforeSignature = listingSignature(before);

    const folders = new Map<string, LoadedTool>();
    const roots: [ToolSource, string][] = [
      ['library', paths.libraryDir],
      ['session', paths.toolsDir],
    ];
    for (const [source, root] of roots) {
      for (const dir of listToolEntries(root)) {
        const key = `${source}/${path.basename(dir, '.mjs')}`;
        const tool = await this.loadCached(dir, source);
        if (folders.has(key)) {
          // Both <name>/ and <name>.mjs: keep the folder, reject the file.
          folders.set(`${key}.mjs`, { ...tool, ok: false, errors: [`both ${path.basename(dir, '.mjs')}/ and ${path.basename(dir)} exist; keep one`] });
          continue;
        }
        folders.set(key, tool);
      }
    }

    const active = new Map<string, LoadedTool>();
    for (const [source] of roots) {
      for (const tool of folders.values()) {
        if (tool.source !== source || !tool.ok || !tool.def) continue;
        // Tools are cached between scans: drop the warning of an earlier scan, the library tool may be gone.
        tool.warnings = tool.warnings.filter((w) => !w.startsWith('shadows'));
        if (active.has(tool.def.name)) tool.warnings.push('shadows the library tool of the same name until it is promoted or removed');
        active.set(tool.def.name, tool);
      }
    }

    this.folders = folders;
    this.active = active;

    const added: string[] = [];
    const updated: string[] = [];
    const removed: string[] = [];
    const invalid: string[] = [];
    for (const [name, tool] of active) {
      const prev = before.get(name);
      if (!prev) added.push(name);
      else if (prev.hash !== tool.hash || prev.source !== tool.source) updated.push(name);
    }
    for (const name of before.keys()) if (!active.has(name)) removed.push(name);
    for (const [key, tool] of folders) {
      if (tool.ok) continue;
      const prev = beforeFolders.get(key);
      if (!prev || prev.hash !== tool.hash || prev.ok) invalid.push(key);
    }
    return { added, updated, removed, invalid, listChanged: listingSignature(active) !== beforeSignature };
  }

  private async loadCached(dir: string, source: ToolSource): Promise<LoadedTool> {
    const cacheKey = `${source}:${dir}`;
    const cached = this.cache.get(cacheKey);
    if (cached?.hash === hashTool(dir)) return cached;
    const fresh = await loadToolEntry(dir, source, { execAllowed: this.opts.execAllowed, env: this.opts.env });
    // Library tools were verified (examples passed) when they were promoted. Re-running their examples here would
    // delay startup, and Claude Code starts the session without a server that is not ready within a few seconds.
    if (fresh.ok && source !== 'library') await this.runExamples(fresh);
    this.cache.set(cacheKey, fresh);
    return fresh;
  }

  private runExamples(tool: LoadedTool): Promise<void> {
    return runToolExamples(tool, { projectDir: this.opts.paths.projectDir, execAllowed: this.opts.execAllowed, sessionId: this.opts.sessionId, env: this.opts.env });
  }
}

/** Runs a tool's examples as a smoke test. A failing example makes the tool invalid. */
export async function runToolExamples(
  tool: LoadedTool,
  opts: { projectDir: string; execAllowed: boolean; sessionId?: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  const examples = tool.def?.examples ?? [];
  if (!examples.length) return;
  if (!opts.execAllowed) {
    tool.examples = { passed: 0, failed: 0, failures: [], skipped: 'execution is disabled (TROD_ALLOW_EXEC is not 1)' };
    return;
  }
  const report = { passed: 0, failed: 0, failures: [] as string[] };
  for (const [i, ex] of examples.entries()) {
    const res = await executeTool({
      runner: tool.runner!,
      runPath: tool.runPath!,
      toolDir: tool.dir,
      toolName: tool.def!.name,
      projectDir: opts.projectDir,
      input: ex.input,
      timeoutMs: tool.def!.timeoutMs,
      sessionId: opts.sessionId,
      env: opts.env,
    });
    const failure = res.ok ? checkExpectation(ex.expect, res.text, res.value) : `threw: ${res.error ?? res.text.slice(0, 500)}`;
    if (failure) {
      report.failed++;
      report.failures.push(`examples[${i}]${ex.description ? ` (${ex.description})` : ''}: ${failure}`);
    } else report.passed++;
  }
  tool.examples = report;
  if (report.failed) {
    tool.ok = false;
    tool.errors.push(...report.failures);
  }
}
