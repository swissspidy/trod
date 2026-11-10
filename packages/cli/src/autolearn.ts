import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readTrodConfig, writeTrodConfig, type TrodPaths } from '@trod/server';
import { LEARN_STATE_DIR, readLearnState } from './learn.ts';
import { TROD_SESSION_ENV } from './session-env.ts';

export { TROD_SESSION_ENV };

/**
 * Learning that runs itself. With `trod learn --auto <n>`, trod's SessionEnd hook records every finished session in an
 * inbox; once n sessions have ended since the last learning run, it starts `trod learn` in the background (detached,
 * so the session that just ended is not held up). The learning run is the normal incremental one: it reads only new
 * sessions, checks the existing rules against them and leaves a diff to review. A cooldown and the learn lock keep
 * runs from piling up, and sessions that trod itself started (forge, learn, tune) never count.
 */

export const INBOX_FILE = path.join(LEARN_STATE_DIR, 'inbox.jsonl');
const AUTO_STATE_FILE = path.join(LEARN_STATE_DIR, 'auto-learn.json');
export const AUTO_LOG = path.join('.trod', 'logs', 'auto-learn.log');

export interface AutoLearnConfig {
  /** Start a learning run once this many sessions have ended since the last one. */
  after: number;
  /** At most one automatic run per this many hours (default 6). */
  cooldownHours?: number;
}

export function autoLearnConfig(paths: TrodPaths): AutoLearnConfig | undefined {
  const a = readTrodConfig(paths).autoLearn;
  return a && Number.isInteger(a.after) && a.after >= 1 ? a : undefined;
}

/** `trod learn --auto <n|off>`: turns automatic learning on (after n sessions) or off. */
export function setAutoLearn(paths: TrodPaths, value: string): { ok: true; message: string } | { ok: false; message: string } {
  const config = readTrodConfig(paths);
  if (value === 'off') {
    const { autoLearn: _, ...rest } = config;
    writeTrodConfig(paths, rest);
    return { ok: true, message: 'automatic learning is off' };
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return { ok: false, message: '--auto takes a number of sessions (e.g. 10) or "off"' };
  const cooldownHours = config.autoLearn?.cooldownHours ?? 6;
  writeTrodConfig(paths, { ...config, autoLearn: { after: n, cooldownHours } });
  return { ok: true, message: `automatic learning is on: trod's SessionEnd hook starts \`trod learn\` in the background after every ${n} finished session(s) (at most once per ${cooldownHours} hours; log: ${AUTO_LOG}). It needs trod's hooks (trod init or the plugin). Commit .trod/config.json to turn it on for everyone, or keep it local.` };
}

interface InboxEntry {
  session: string;
  transcript?: string;
  endedAt: string;
}

function readInbox(paths: TrodPaths): InboxEntry[] {
  const file = path.join(paths.projectDir, INBOX_FILE);
  if (!existsSync(file)) return [];
  const out: InboxEntry[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as InboxEntry);
    } catch {
      // torn line
    }
  }
  return out;
}

function ensureState(paths: TrodPaths): void {
  const dir = path.join(paths.projectDir, LEARN_STATE_DIR);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(path.join(dir, '.gitignore'))) writeFileSync(path.join(dir, '.gitignore'), '# machine-local trod state (written by trod learn)\n*\n');
}

/** Sessions that ended after the last learning run and that it has not learned from. */
export function pendingSessions(paths: TrodPaths): string[] {
  const state = readLearnState(paths.projectDir);
  const learned = new Set(state.sessions);
  const since = state.lastRun ? Date.parse(state.lastRun) : 0;
  return [...new Set(readInbox(paths).filter((e) => Date.parse(e.endedAt) > since && !learned.has(e.session)).map((e) => e.session))];
}

function learnLocked(paths: TrodPaths): boolean {
  const lock = path.join(paths.projectDir, LEARN_STATE_DIR, 'learn.lock');
  if (!existsSync(lock)) return false;
  const pid = Number(readFileSync(lock, 'utf8'));
  try {
    if (pid > 0) process.kill(pid, 0);
    return pid > 0;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Starts `trod learn` detached from the hook, with its output in .trod/logs/auto-learn.log. */
export function spawnLearn(paths: TrodPaths, cli = process.argv[1]!, env: NodeJS.ProcessEnv = process.env): void {
  const log = path.join(paths.projectDir, AUTO_LOG);
  mkdirSync(path.dirname(log), { recursive: true });
  appendFileSync(log, `\n=== ${new Date().toISOString()} automatic trod learn ===\n`);
  const fd = openSync(log, 'a');
  const childEnv: NodeJS.ProcessEnv = { ...env, [TROD_SESSION_ENV]: 'learn' };
  delete childEnv.CLAUDECODE;
  const child = spawn(process.execPath, [cli, 'learn', '--dir', paths.projectDir], { cwd: paths.projectDir, env: childEnv, detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
}

export interface SessionEndResult {
  recorded: boolean;
  pending: number;
  started: boolean;
  reason?: string;
}

/**
 * Handles a SessionEnd hook payload. Does nothing unless automatic learning is on; never throws for a bad payload.
 * `start` launches the learning run (spawnLearn in production).
 */
export function sessionEndHook(paths: TrodPaths, payload: { session_id?: string; transcript_path?: string }, start: (paths: TrodPaths) => void = (p) => spawnLearn(p), now = new Date(), env: NodeJS.ProcessEnv = process.env): SessionEndResult {
  const config = autoLearnConfig(paths);
  if (!config) return { recorded: false, pending: 0, started: false, reason: 'automatic learning is off' };
  if (env[TROD_SESSION_ENV]) return { recorded: false, pending: 0, started: false, reason: `a session trod started (${env[TROD_SESSION_ENV]})` };
  if (!payload.session_id) return { recorded: false, pending: 0, started: false, reason: 'no session id' };
  ensureState(paths);
  appendFileSync(path.join(paths.projectDir, INBOX_FILE), `${JSON.stringify({ session: payload.session_id, transcript: payload.transcript_path, endedAt: now.toISOString() })}\n`);
  const pending = pendingSessions(paths).length;
  if (pending < config.after) return { recorded: true, pending, started: false, reason: `${pending}/${config.after} sessions since the last learning run` };
  const stateFile = path.join(paths.projectDir, AUTO_STATE_FILE);
  let last = 0;
  try {
    last = Date.parse((JSON.parse(readFileSync(stateFile, 'utf8')) as { lastStarted?: string }).lastStarted ?? '') || 0;
  } catch {
    // never started
  }
  const cooldown = (config.cooldownHours ?? 6) * 3_600_000;
  if (now.getTime() - last < cooldown) return { recorded: true, pending, started: false, reason: 'cooldown since the last automatic run' };
  if (learnLocked(paths)) return { recorded: true, pending, started: false, reason: 'a learning run is in progress' };
  writeFileSync(stateFile, JSON.stringify({ lastStarted: now.toISOString(), pending }));
  start(paths);
  return { recorded: true, pending, started: true };
}
