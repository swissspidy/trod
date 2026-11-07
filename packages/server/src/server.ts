import { existsSync, mkdirSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { DEFAULT_MAX_OUTPUT_CHARS, EVAL_RUNNER, MAX_TIMEOUT_MS, executeTool } from './executor.ts';
import { CallLog, readLogs } from './logs.ts';
import { computeStats } from './stats.ts';
import { Registry, describeForClient, type RegistryChange } from './registry.ts';
import type { LoadedTool, TrodPaths } from './types.ts';
import { validateInput } from './validate.ts';

export const VERSION = '0.4.0';

export interface TrodServerOptions {
  paths: TrodPaths;
  env?: NodeJS.ProcessEnv;
  /** Debounce for file system events, in ms. */
  debounceMs?: number;
  /** Polling interval as a fallback for missed watch events, in ms (0 disables). */
  pollMs?: number;
}

interface Usage {
  calls: number;
  errors: number;
  totalMs: number;
  lastError?: string;
}

/** The one permanent tool. Its definition never changes, so the prompt cache stays warm. */
// Both permanent tools set _meta anthropic/alwaysLoad: they are always in the prompt, even with tool search on.
// They are fixed from the start, so they never invalidate the prompt cache.
export const STATUS_TOOL: Tool = {
  name: 'trod_status',
  description:
    'Shows the trod tool registry: which tools in .trod/tools (session) and .trod/library are live, ' +
    'which failed validation and why (schema, syntax, failing examples), and per-tool usage. ' +
    'Call it after writing or changing a tool to confirm it registered. Pass "name" for one tool in detail.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A tool or folder name to show in detail.' },
    },
    additionalProperties: false,
  },
  _meta: { 'anthropic/alwaysLoad': true },
};

/**
 * The second permanent tool: calls any registered trod tool by name. Its definition never changes, so a tool written
 * mid-session can be called in the very next turn without loading it through tool search and without changing the
 * tool list (which would invalidate the prompt cache).
 */
export const RUN_TOOL: Tool = {
  name: 'trod_run',
  description:
    'Runs a trod tool (from .trod/tools or .trod/library) by name, right after you wrote it, with no need to load it first. ' +
    '"input" must match that tool\'s inputSchema. Returns the tool\'s result.',
  inputSchema: {
    type: 'object',
    properties: {
      tool: { type: 'string', description: 'The trod tool name (file or folder name, e.g. "fetch_ticket").' },
      input: { type: 'object', description: 'The input for that tool.' },
    },
    required: ['tool'],
    additionalProperties: false,
  },
  _meta: { 'anthropic/alwaysLoad': true },
};


/** Shown in the system prompt. Enough to build and call a tool without loading the skill. */
export const SERVER_INSTRUCTIONS = `trod turns a file into a tool you can call. When you are about to write a helper script you will run more than once (a repeated lookup, an authenticated or paginated request, a parser, a browser step), write it as a trod tool instead: same effort, cheaper and safer to call.

Write .trod/tools/<name>.mjs (Node ESM, built-ins only):
  export const meta = { description: 'what it returns', whenToUse: 'when to call it', inputSchema: { type: 'object', properties: { … }, required: [ … ] } };
  export default async (input, ctx) => result;   // return only what you need: compact objects or text
Build capabilities, not answers: a tool that fetches clean, normalized records (auth, paging, retries and format quirks handled) serves tomorrow's different question; a tool that computes today's answer does not. Design for batches: let one call take a list (e.g. queries: [...]) and return all answers, and send independent calls in parallel in one message; every extra turn costs. The Write result says whether the tool is live or shows the errors. Then call it with trod_run {"tool": "<name>", "input": { … }}: no loading needed, also in later turns. To use several tools and compute an answer in ONE call, use trod_eval with code like "const a = await tools.x({…}); return summarize(a)": only the returned value enters the conversation. Change the file in place when needs change. Tools in .trod/library are verified tools from earlier sessions: call them directly (trod_status lists them). The trod skill has details.`;

/**
 * The third permanent tool: code mode. One call runs an async function body in which every trod tool is a function
 * (tools.<name>(input)), so fetching, combining and computing happen in one turn and bulky intermediate data never
 * enters the context.
 */
export const EVAL_TOOL: Tool = {
  name: 'trod_eval',
  description:
    'Runs JavaScript (the body of an async function) with every trod tool available as an async function: ' +
    '`const items = await tools.inv_items({ warehouse: "BER" })`. Also available: fs, fsp (fs/promises), path, projectDir. ' +
    'Use it to call several tools, combine their results and compute an answer (or write a file) in ONE call; ' +
    'only the value you return comes back, so large intermediate data stays out of the conversation.',
  inputSchema: {
    type: 'object',
    properties: { code: { type: 'string', description: 'Async function body; `return` the result you want to see.' } },
    required: ['code'],
    additionalProperties: false,
  },
  _meta: { 'anthropic/alwaysLoad': true },
};

export const RESERVED = new Set([STATUS_TOOL.name, RUN_TOOL.name, EVAL_TOOL.name]);

/** One-line signature from a JSON Schema: (a: string, b?: number). */
function signature(schema: Record<string, unknown>): string {
  const props = (schema.properties ?? {}) as Record<string, { type?: string | string[]; enum?: unknown[] }>;
  const req = new Set((schema.required as string[] | undefined) ?? []);
  return Object.entries(props)
    .map(([k, v]) => `${k}${req.has(k) ? '' : '?'}: ${v.enum ? v.enum.map((x) => JSON.stringify(x)).join('|') : Array.isArray(v.type) ? v.type.join('|') : (v.type ?? 'any')}`)
    .join(', ');
}

/**
 * Library cards: what the committed library offers, with its evidence (examples that passed, usage in earlier
 * sessions), written into the instructions at startup so a fresh session knows what it can rely on before its first
 * turn. Fixed for the session, so it does not disturb the prompt cache.
 */
/** Short instructions used when a library exists, so the cards get most of Claude Code's instruction budget. */
export const LIBRARY_INSTRUCTIONS = `trod: tools for this project. Call a tool with trod_run {"tool": "<name>", "input": {…}}, or call several and compute the answer in ONE call with trod_eval {"code": "const r = await tools.<name>({…}); return …"} (only the returned value comes back; fs, fsp, path, projectDir are available). New tools: write .trod/tools/<name>.mjs (export const meta = { description, whenToUse, inputSchema }; export default async (input, ctx) => result).`;

/**
 * Claude Code truncates a server's instructions at about 4096 characters (CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH), so
 * the cards share a budget; trod_status {"name": "library"} returns the full documentation in one call.
 */
export const INSTRUCTIONS_BUDGET = 3800;

export function libraryCards(tools: LoadedTool[], stats: Map<string, { calls: number; errors: number; sessions: number }>, maxChars = INSTRUCTIONS_BUDGET - LIBRARY_INSTRUCTIONS.length): string {
  const lib = tools.filter((t) => t.source === 'library' && t.ok && t.def).sort((a, b) => a.def!.name.localeCompare(b.def!.name));
  if (!lib.length) return '';
  const header =
    '\nLIBRARY (built and verified in earlier sessions; rely on it instead of rediscovering API or format details; no need to read the source). ' +
    'Full documentation of all library tools in one call: trod_status {"name": "library"}.';
  const perTool = Math.max(160, Math.floor((maxChars - header.length) / lib.length) - 2);
  const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…');
  const lines = [header];
  for (const t of lib) {
    const d = t.def!;
    const s = stats.get(d.name);
    const evidence = [d.examples?.length ? 'verified' : '', s && s.calls ? `used ${s.calls}× in ${s.sessions} session(s), ${s.errors} error(s)` : ''].filter(Boolean).join('; ');
    const head = `- ${d.name}(${signature(d.inputSchema)})${evidence ? ` [${evidence}]` : ''}: `;
    lines.push(head + clip(`${d.description.trim()} When: ${d.whenToUse.trim()}`, perTool - head.length));
  }
  return lines.join('\n');
}

export function sessionIdFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  return env.TROD_SESSION_ID || env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_SESSION_ID || undefined;
}

export class TrodServer {
  readonly server: Server;
  readonly registry: Registry;
  readonly log: CallLog;
  readonly paths: TrodPaths;
  readonly execAllowed: boolean;
  readonly sessionId?: string;
  private env: NodeJS.ProcessEnv;
  private usage = new Map<string, Usage>();
  private watcher?: FSWatcher;
  private pollTimer?: NodeJS.Timeout;
  private debounceTimer?: NodeJS.Timeout;
  private lastFingerprint = '';
  private opts: TrodServerOptions;
  private maxOutputChars: number;
  private connected = false;

  constructor(opts: TrodServerOptions) {
    this.opts = opts;
    this.paths = opts.paths;
    this.env = opts.env ?? process.env;
    this.execAllowed = this.env.TROD_ALLOW_EXEC === '1';
    this.sessionId = sessionIdFromEnv(this.env);
    this.maxOutputChars = Number(this.env.TROD_MAX_OUTPUT_CHARS) || DEFAULT_MAX_OUTPUT_CHARS;
    this.registry = new Registry({ paths: this.paths, execAllowed: this.execAllowed, sessionId: this.sessionId, env: this.env });
    this.log = new CallLog(this.paths.logsDir);
    this.server = new Server(
      { name: 'trod', version: VERSION },
      {
        capabilities: { tools: { listChanged: true } },
        instructions: SERVER_INSTRUCTIONS,
      },
    );
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.listTools() }));
    this.server.setRequestHandler(CallToolRequestSchema, async (req) => this.callTool(req.params.name, req.params.arguments ?? {}));
  }

  listTools(): Tool[] {
    const dynamic = [...this.registry.active.values()]
      .sort((a, b) => a.def!.name.localeCompare(b.def!.name))
      .map((t) => ({
        name: t.def!.name,
        description: describeForClient(t.def!, t),
        inputSchema: t.def!.inputSchema as Tool['inputSchema'],
      }));
    return [STATUS_TOOL, RUN_TOOL, EVAL_TOOL, ...dynamic];
  }

  async start(): Promise<void> {
    mkdirSync(this.paths.toolsDir, { recursive: true });
    const change = await this.registry.reload();
    this.lastFingerprint = this.registry.fingerprint();
    this.logChange(change);
    this.log.write({
      type: 'server',
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      event: 'start',
      execAllowed: this.execAllowed,
      version: VERSION,
      tools: [...this.registry.active.keys()],
    });
    // Library cards go into the instructions the client receives at initialize (the server connects after start()).
    const stats = new Map(computeStats(readLogs(this.paths.logsDir)).tools.map((t) => [t.tool, t]));
    const cards = libraryCards([...this.registry.active.values()], stats);
    if (cards) (this.server as unknown as { _instructions?: string })._instructions = LIBRARY_INSTRUCTIONS + cards;
    this.watch();
  }

  /** Marks the server connected; list_changed notifications are only sent after that. */
  markConnected(): void {
    this.connected = true;
  }

  private watch(): void {
    const onEvent = (_event: string, file: string | Buffer | null) => {
      const f = String(file ?? '');
      if (f.startsWith('logs') || f.startsWith('state')) return;
      this.schedule();
    };
    try {
      if (existsSync(this.paths.trodDir)) this.watcher = watch(this.paths.trodDir, { recursive: true }, onEvent);
    } catch {
      // Polling below still catches changes.
    }
    const pollMs = this.opts.pollMs ?? 1000;
    if (pollMs > 0) {
      this.pollTimer = setInterval(() => {
        if (this.registry.fingerprint() !== this.lastFingerprint) this.schedule();
      }, pollMs);
      this.pollTimer.unref();
    }
  }

  private schedule(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.refresh(), this.opts.debounceMs ?? 150);
  }

  /** Rescans, logs what changed and notifies the client when its tool list changed. */
  async refresh(): Promise<RegistryChange> {
    this.lastFingerprint = this.registry.fingerprint();
    const change = await this.registry.reload();
    this.logChange(change);
    if (change.listChanged && this.connected) {
      try {
        await this.server.sendToolListChanged();
      } catch {
        // client gone
      }
    }
    return change;
  }

  private logChange(change: RegistryChange): void {
    const ts = new Date().toISOString();
    const sessionId = this.sessionId;
    for (const tool of change.added) this.log.write({ type: 'tool', ts, sessionId, event: 'added', tool, source: this.registry.active.get(tool)?.source });
    for (const tool of change.updated) this.log.write({ type: 'tool', ts, sessionId, event: 'updated', tool, source: this.registry.active.get(tool)?.source });
    for (const tool of change.removed) this.log.write({ type: 'tool', ts, sessionId, event: 'removed', tool });
    for (const key of change.invalid) {
      const t = this.registry.folders.get(key);
      this.log.write({ type: 'tool', ts, sessionId, event: 'invalid', tool: t?.folder ?? key, source: t?.source, errors: t?.errors });
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    if (name === STATUS_TOOL.name) return { content: [{ type: 'text', text: this.status(typeof args.name === 'string' ? args.name : undefined) }] };
    if (name === EVAL_TOOL.name) return this.evalCode(typeof args.code === 'string' ? args.code : '');
    if (name === RUN_TOOL.name) {
      const target = typeof args.tool === 'string' ? args.tool : '';
      if (!target || RESERVED.has(target)) return { isError: true, content: [{ type: 'text', text: 'trod_run: "tool" must name a trod tool (see trod_status).' }] };
      const input = args.input && typeof args.input === 'object' ? (args.input as Record<string, unknown>) : {};
      return this.callTool(target, input);
    }

    let tool = this.registry.active.get(name);
    // The agent may call a tool right after writing it, before the watcher fired.
    if (!tool && this.registry.fingerprint() !== this.lastFingerprint) {
      await this.refresh();
      tool = this.registry.active.get(name);
    }
    if (!tool) {
      const invalid = [...this.registry.folders.values()].find((t) => t.folder === name && !t.ok);
      const text = invalid
        ? `trod: tool "${name}" is not registered because it failed validation:\n- ${invalid.errors.join('\n- ')}`
        : `trod: unknown tool "${name}". Call trod_status to see the registry.`;
      return { isError: true, content: [{ type: 'text', text }] };
    }
    const def = tool.def!;
    if (!this.execAllowed) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              'trod: tool execution is disabled. Tool code runs outside Claude Code\'s permission prompts and sandbox, ' +
              'so the trod server only runs tools when TROD_ALLOW_EXEC=1 is set in its environment (intended for ephemeral cloud containers). ' +
              'Use Bash instead, or ask the user to set TROD_ALLOW_EXEC=1.',
          },
        ],
      };
    }
    const inputErrors = validateInput(def, args);
    if (inputErrors.length) {
      return { isError: true, content: [{ type: 'text', text: `trod: invalid input for ${name}:\n- ${inputErrors.join('\n- ')}` }] };
    }

    const res = await executeTool({
      runner: tool.runner!,
      runPath: tool.runPath!,
      toolDir: tool.dir,
      toolName: def.name,
      projectDir: this.paths.projectDir,
      input: args,
      timeoutMs: def.timeoutMs,
      maxOutputChars: this.maxOutputChars,
      sessionId: this.sessionId,
      env: this.env,
    });
    this.record(tool, args, res.ok, res.durationMs, res.outputChars, res.truncated, res.error);
    const text = res.text === '' ? (res.ok ? '(empty result)' : 'Error') : res.text;
    return { isError: !res.ok, content: [{ type: 'text', text }] };
  }

  private record(tool: LoadedTool, args: unknown, ok: boolean, durationMs: number, outputChars: number, truncated: boolean, error?: string) {
    const name = tool.def!.name;
    const u = this.usage.get(name) ?? { calls: 0, errors: 0, totalMs: 0 };
    u.calls++;
    u.totalMs += durationMs;
    if (!ok) {
      u.errors++;
      u.lastError = error;
    }
    this.usage.set(name, u);
    this.log.write({
      type: 'call',
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      tool: name,
      source: tool.source,
      durationMs,
      ok,
      error,
      inputChars: JSON.stringify(args).length,
      outputChars,
      truncated,
    });
  }

  /** trod_eval: run code with every live tool exposed as a function. */
  async evalCode(code: string): Promise<CallToolResult> {
    if (!code.trim()) return { isError: true, content: [{ type: 'text', text: 'trod_eval: "code" is required.' }] };
    if (!this.execAllowed) return { isError: true, content: [{ type: 'text', text: 'trod: tool execution is disabled (TROD_ALLOW_EXEC is not 1).' }] };
    if (this.registry.fingerprint() !== this.lastFingerprint) await this.refresh();
    const tools = [...this.registry.active.values()].map((t) => ({ name: t.def!.name, runner: t.runner, runPath: t.runPath, dir: t.dir }));
    const res = await executeTool({
      script: EVAL_RUNNER,
      runner: 'mjs',
      runPath: '',
      toolDir: this.paths.trodDir,
      toolName: EVAL_TOOL.name,
      projectDir: this.paths.projectDir,
      input: { code, tools },
      timeoutMs: MAX_TIMEOUT_MS,
      maxOutputChars: this.maxOutputChars,
      sessionId: this.sessionId,
      env: this.env,
    });
    const ts = new Date().toISOString();
    for (const c of res.calls ?? []) {
      const t = this.registry.active.get(c.tool);
      if (!t) continue;
      this.record(t, {}, c.ok, c.ms, 0, false, c.ok ? undefined : 'failed inside trod_eval');
    }
    this.log.write({ type: 'call', ts, sessionId: this.sessionId, tool: EVAL_TOOL.name, source: 'session', durationMs: res.durationMs, ok: res.ok, error: res.error, inputChars: code.length, outputChars: res.outputChars, truncated: res.truncated });
    const text = res.text === '' ? (res.ok ? '(empty result)' : 'Error') : res.text;
    return { isError: !res.ok, content: [{ type: 'text', text }] };
  }

  status(name?: string): string {
    const rel = (p: string) => path.relative(this.paths.projectDir, p) || '.';
    if (name) {
      const matches = [...this.registry.folders.values()].filter((t) => (name === 'library' ? t.source === 'library' : t.folder === name || t.def?.name === name));
      if (!matches.length) return `trod: no tool or folder named "${name}". Call trod_status without arguments for the list.`;
      return matches
        .map((t) => {
          const live = t.ok && this.registry.active.get(t.def!.name) === t;
          const u = t.def ? this.usage.get(t.def.name) : undefined;
          const lines = [
            `## ${t.folder} (${t.source}, ${live ? 'live' : t.ok ? 'shadowed' : 'INVALID'})`,
            `path: ${rel(t.dir)}`,
          ];
          if (t.def) {
            lines.push(`description: ${t.def.description}`, `whenToUse: ${t.def.whenToUse}`, `inputSchema: ${JSON.stringify(t.def.inputSchema)}`);
            if (t.runner) lines.push(`runner: ${t.runner}`);
          }
          if (t.examples) lines.push(`examples: ${t.examples.skipped ? `skipped (${t.examples.skipped})` : `${t.examples.passed} passed, ${t.examples.failed} failed`}`);
          if (t.errors.length) lines.push('errors:', ...t.errors.map((e) => `- ${e}`));
          if (t.warnings.length) lines.push('warnings:', ...t.warnings.map((w) => `- ${w}`));
          if (u) lines.push(`usage this session: ${u.calls} calls, ${u.errors} errors, avg ${Math.round(u.totalMs / u.calls)} ms${u.lastError ? `, last error: ${u.lastError}` : ''}`);
          return lines.join('\n');
        })
        .join('\n\n');
    }

    const all = [...this.registry.folders.values()];
    const invalid = all.filter((t) => !t.ok);
    const lines = [
      `trod ${VERSION}: ${this.registry.active.size} live tool(s), ${invalid.length} invalid. Execution ${this.execAllowed ? 'enabled' : 'DISABLED (set TROD_ALLOW_EXEC=1)'}.`,
      `session tools: ${rel(this.paths.toolsDir)}/<name>/  library: ${rel(this.paths.libraryDir)}/<name>/`,
    ];
    if (this.registry.active.size) {
      lines.push('', 'live:');
      for (const t of [...this.registry.active.values()].sort((a, b) => a.def!.name.localeCompare(b.def!.name))) {
        const u = this.usage.get(t.def!.name);
        const ex = t.examples ? (t.examples.skipped ? ', examples skipped' : `, examples ${t.examples.passed}/${t.examples.passed + t.examples.failed}`) : '';
        const use = u ? `, ${u.calls} call(s), ${u.errors} error(s), avg ${Math.round(u.totalMs / u.calls)} ms` : ', not called yet';
        lines.push(`- ${t.def!.name} [${t.source}]${ex}${use}${t.warnings.length ? ` (${t.warnings.length} warning(s))` : ''}`);
      }
    }
    if (invalid.length) {
      lines.push('', 'invalid (not registered):');
      for (const t of invalid) lines.push(`- ${t.source}/${t.folder}:`, ...t.errors.map((e) => `    - ${e}`));
    }
    if (!all.length) lines.push('', 'No tools yet. Create .trod/tools/<name>/tool.json and run.mjs (or run.sh); see the trod skill.');
    return lines.join('\n');
  }

  async close(): Promise<void> {
    this.watcher?.close();
    clearInterval(this.pollTimer);
    clearTimeout(this.debounceTimer);
    await this.server.close();
  }
}
