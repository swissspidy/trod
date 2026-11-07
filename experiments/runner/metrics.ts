import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { readLogs } from '../../packages/server/src/logs.ts';
import { computeStats } from '../../packages/server/src/stats.ts';
import type { CheckResult, Task } from '../lib/types.ts';

export interface Usage {
  input: number;
  cacheCreation: number;
  cacheRead: number;
  output: number;
  /** input + cacheCreation + cacheRead + output */
  total: number;
}

export interface StepOutcome {
  step: number;
  wallMs: number;
  exitCode: number | null;
  timedOut: boolean;
  check: CheckResult;
}

export interface RunRecord {
  id: string;
  task: string;
  kind: Task['kind'];
  arm: 'baseline' | 'scripts' | 'genesis' | 'nudged' | 'library' | 'toolsmith';
  seed: number;
  model: string;
  check: CheckResult;
  steps: StepOutcome[];
  exitCode: number | null;
  timedOut: boolean;
  resultSubtype?: string;
  wallMs: number;
  apiMs?: number;
  turns: number;
  costUsd: number;
  tokens: Usage;
  /** Where the usage numbers came from: the session transcript (preferred) or the stream. */
  usageSource: 'transcript' | 'stream';
  assistantMessages: number;
  toolCalls: Record<string, number>;
  trod: {
    toolsCreated: number;
    toolNames: string[];
    /** Library tools present at start (library arm). */
    libraryTools: number;
    calls: number;
    callErrors: number;
    /** trod tool calls per created tool. */
    callsPerTool: number;
    statusCalls: number;
    /** Assistant messages that wrote/edited .trod/tools files or called trod_status, and their tokens. */
    creationMessages: number;
    creationOutputTokens: number;
    creationTotalTokens: number;
    perTool: { tool: string; calls: number; errors: number; revisions: number; avgMs: number }[];
  };
}

const TROD_STATUS = new Set(['mcp__trod__trod_status', 'mcp__plugin_trod_trod__trod_status']);

function emptyUsage(): Usage {
  return { input: 0, cacheCreation: 0, cacheRead: 0, output: 0, total: 0 };
}

function addUsage(u: Usage, raw: any): void {
  if (!raw) return;
  u.input += raw.input_tokens ?? 0;
  u.cacheCreation += raw.cache_creation_input_tokens ?? 0;
  u.cacheRead += raw.cache_read_input_tokens ?? 0;
  u.output += raw.output_tokens ?? 0;
  u.total = u.input + u.cacheCreation + u.cacheRead + u.output;
}

function readJsonl(file: string): any[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
}

function findFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...findFiles(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

/**
 * Collapses streamed assistant events into messages. Claude Code emits one event per content block, and they
 * share the API message id and its usage; usage is counted once per id (the last event's, which is final).
 */
function assistantMessages(events: any[]): { id: string; usage: any; tools: { name: string; input: any }[] }[] {
  const byId = new Map<string, { id: string; usage: any; tools: { name: string; input: any }[] }>();
  for (const e of events) {
    const msg = e.type === 'assistant' ? e.message : undefined;
    if (!msg?.id) continue;
    if (e.isSidechain) continue;
    let m = byId.get(msg.id);
    if (!m) {
      m = { id: msg.id, usage: msg.usage, tools: [] };
      byId.set(msg.id, m);
    }
    if (msg.usage) m.usage = msg.usage;
    for (const c of msg.content ?? []) if (c.type === 'tool_use') m.tools.push({ name: c.name, input: c.input });
  }
  return [...byId.values()];
}

const isCreation = (t: { name: string; input: any }) =>
  ((t.name === 'Write' || t.name === 'Edit') && String(t.input?.file_path ?? '').includes('/.trod/tools/')) || TROD_STATUS.has(t.name);

export function collectMetrics(r: {
  id: string;
  task: Task;
  arm: 'baseline' | 'scripts' | 'genesis' | 'nudged' | 'library' | 'toolsmith';
  seed: number;
  runDir: string;
  work: string;
  home: string;
  wallMs: number;
  exitCode: number | null;
  timedOut: boolean;
  check: CheckResult;
  steps: StepOutcome[];
  model: string;
}): RunRecord {
  // One stream per step (stream-1.jsonl, …); each ends with a result event.
  const streamFiles = readdirSync(r.runDir).filter((f) => /^stream-\d+\.jsonl$/.test(f)).sort();
  const stream = streamFiles.flatMap((f) => readJsonl(path.join(r.runDir, f)));
  const results = stream.filter((e) => e.type === 'result');

  // Transcripts: ~/.claude/projects/<project>/<session>.jsonl in the isolated config dir.
  const transcripts = findFiles(path.join(r.home, '.claude', 'projects'), '.jsonl');
  const transcriptEvents = transcripts.flatMap(readJsonl);
  const fromTranscript = assistantMessages(transcriptEvents);
  const fromStream = assistantMessages(stream);
  const messages = fromTranscript.length ? fromTranscript : fromStream;

  const tokens = emptyUsage();
  for (const m of messages) addUsage(tokens, m.usage);

  const toolCalls: Record<string, number> = {};
  for (const m of fromStream.length ? fromStream : messages) for (const t of m.tools) toolCalls[t.name] = (toolCalls[t.name] ?? 0) + 1;

  const creation = messages.filter((m) => m.tools.some(isCreation));
  const creationUsage = emptyUsage();
  for (const m of creation) addUsage(creationUsage, m.usage);

  const logs = readLogs(path.join(r.work, '.trod', 'logs'));
  const stats = computeStats(logs);
  const created = stats.tools.filter((t) => t.createdAt);
  const trodCalls = stats.tools.reduce((n, t) => n + t.calls, 0);

  return {
    id: r.id,
    task: r.task.id,
    kind: r.task.kind,
    arm: r.arm,
    seed: r.seed,
    model: r.model,
    check: r.check,
    steps: r.steps,
    exitCode: r.exitCode,
    timedOut: r.timedOut,
    resultSubtype: results.map((x) => x.subtype).join(','),
    wallMs: r.wallMs,
    apiMs: results.reduce((n, x) => n + (x.duration_api_ms ?? 0), 0),
    turns: results.length ? results.reduce((n, x) => n + (x.num_turns ?? 0), 0) : messages.length,
    costUsd: results.reduce((n, x) => n + (x.total_cost_usd ?? 0), 0),
    tokens,
    usageSource: fromTranscript.length ? 'transcript' : 'stream',
    assistantMessages: messages.length,
    toolCalls,
    trod: {
      toolsCreated: created.length,
      toolNames: created.map((t) => t.tool),
      libraryTools: existsSync(path.join(r.work, '.trod', 'library')) ? readdirSync(path.join(r.work, '.trod', 'library')).length : 0,
      calls: trodCalls,
      callErrors: stats.errors,
      callsPerTool: created.length ? trodCalls / created.length : 0,
      statusCalls: [...TROD_STATUS].reduce((n, k) => n + (toolCalls[k] ?? 0), 0),
      creationMessages: creation.length,
      creationOutputTokens: creationUsage.output,
      creationTotalTokens: creationUsage.total,
      perTool: stats.tools.map((t) => ({ tool: t.tool, calls: t.calls, errors: t.errors, revisions: t.revisions, avgMs: t.avgMs })),
    },
  };
}
