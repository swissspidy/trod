import type { LogRecord } from './logs.ts';

export interface ToolStats {
  tool: string;
  /** Session that first registered the tool as a session tool, if seen in the logs. */
  createdIn?: string;
  createdAt?: string;
  /** Times the tool was (re)written after creation. */
  revisions: number;
  calls: number;
  errors: number;
  /** Calls beyond the first one in the session that created it. */
  repeatCalls: number;
  /** Calls from sessions other than the one that created it (library reuse). */
  crossSessionCalls: number;
  sessions: number;
  totalMs: number;
  avgMs: number;
  outputChars: number;
  truncated: number;
}

export interface StatsSummary {
  sessions: number;
  toolsCreated: number;
  toolsCalled: number;
  toolsReused: number;
  calls: number;
  errors: number;
  tools: ToolStats[];
}

export function computeStats(records: LogRecord[]): StatsSummary {
  const tools = new Map<string, ToolStats & { sessionSet: Set<string>; callsInCreator: number }>();
  const sessions = new Set<string>();
  const get = (name: string) => {
    let t = tools.get(name);
    if (!t) {
      t = {
        tool: name,
        revisions: 0,
        calls: 0,
        errors: 0,
        repeatCalls: 0,
        crossSessionCalls: 0,
        sessions: 0,
        totalMs: 0,
        avgMs: 0,
        outputChars: 0,
        truncated: 0,
        sessionSet: new Set(),
        callsInCreator: 0,
      };
      tools.set(name, t);
    }
    return t;
  };

  for (const r of records) {
    if (r.sessionId) sessions.add(r.sessionId);
    if (r.type === 'tool') {
      if (r.source !== 'session') continue;
      const t = get(r.tool);
      if (r.event === 'added' && !t.createdAt) {
        t.createdAt = r.ts;
        t.createdIn = r.sessionId;
      } else if (r.event === 'updated') t.revisions++;
    } else if (r.type === 'call') {
      const t = get(r.tool);
      t.calls++;
      if (!r.ok) t.errors++;
      t.totalMs += r.durationMs;
      t.outputChars += r.outputChars;
      if (r.truncated) t.truncated++;
      if (r.sessionId) t.sessionSet.add(r.sessionId);
      if (t.createdIn && r.sessionId && r.sessionId !== t.createdIn) t.crossSessionCalls++;
      else t.callsInCreator++;
    }
  }

  const list: ToolStats[] = [...tools.values()]
    .map(({ sessionSet, callsInCreator, ...t }) => ({
      ...t,
      sessions: sessionSet.size,
      repeatCalls: Math.max(0, callsInCreator - 1),
      avgMs: t.calls ? Math.round(t.totalMs / t.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));

  return {
    sessions: sessions.size,
    toolsCreated: list.filter((t) => t.createdAt).length,
    toolsCalled: list.filter((t) => t.calls > 0).length,
    toolsReused: list.filter((t) => t.calls > 1).length,
    calls: list.reduce((n, t) => n + t.calls, 0),
    errors: list.reduce((n, t) => n + t.errors, 0),
    tools: list,
  };
}

export function formatStats(s: StatsSummary): string {
  const lines = [
    `sessions: ${s.sessions}  tools created: ${s.toolsCreated}  called: ${s.toolsCalled}  reused (2+ calls): ${s.toolsReused}  calls: ${s.calls}  errors: ${s.errors}`,
    '',
  ];
  if (!s.tools.length) return lines[0] + '\n(no tool activity in the logs)';
  const header = ['tool', 'calls', 'errors', 'repeat', 'cross-session', 'sessions', 'revisions', 'avg ms'];
  const rows = s.tools.map((t) => [t.tool, t.calls, t.errors, t.repeatCalls, t.crossSessionCalls, t.sessions, t.revisions, t.avgMs].map(String));
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const fmt = (r: string[]) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('  ');
  lines.push(fmt(header), ...rows.map(fmt));
  return lines.join('\n');
}
