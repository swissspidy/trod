import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ToolSource } from './types.ts';

export interface CallRecord {
  type: 'call';
  ts: string;
  sessionId?: string;
  tool: string;
  source: ToolSource;
  durationMs: number;
  ok: boolean;
  error?: string;
  inputChars: number;
  outputChars: number;
  truncated: boolean;
}

export interface ToolEventRecord {
  type: 'tool';
  ts: string;
  sessionId?: string;
  event: 'added' | 'updated' | 'removed' | 'invalid';
  tool: string;
  source?: ToolSource;
  errors?: string[];
}

export interface ServerRecord {
  type: 'server';
  ts: string;
  sessionId?: string;
  event: 'start' | 'relocate';
  execAllowed: boolean;
  version: string;
  tools: string[];
}

export type LogRecord = CallRecord | ToolEventRecord | ServerRecord;

/** Appends JSONL records to one file per server process under .trod/logs/. */
export class CallLog {
  readonly file: string;

  constructor(logsDir: string, startedAt = new Date()) {
    const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
    this.file = path.join(logsDir, `${stamp}-${process.pid}.jsonl`);
  }

  write(record: LogRecord): void {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      appendFileSync(this.file, JSON.stringify(record) + '\n');
    } catch {
      // Logging must never break a tool call.
    }
  }
}

export function readLogs(logsDir: string): LogRecord[] {
  if (!existsSync(logsDir)) return [];
  const records: LogRecord[] = [];
  for (const file of readdirSync(logsDir).filter((f) => f.endsWith('.jsonl')).sort()) {
    for (const line of readFileSync(path.join(logsDir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as LogRecord);
      } catch {
        // skip partial lines
      }
    }
  }
  return records;
}
