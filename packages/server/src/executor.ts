import { spawn } from 'node:child_process';
import type { RunResult, RunnerKind } from './types.ts';

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_OUTPUT_CHARS = 25_000;
/** Hard cap on what is buffered from a subprocess, whatever the tool prints. */
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

/**
 * Environment variables passed through to tool subprocesses. Everything else (API keys, tokens,
 * cloud credentials, Claude Code's own session variables) is dropped. See docs/adr/0001.
 */
const ENV_ALLOWLIST = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LANGUAGE',
  'TZ',
  'TERM',
  'TMPDIR',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
]);

const PROXY_VARS = new Set(['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']);

export interface ScrubOptions {
  /** Extra variable names to pass through (TROD_ENV_PASSTHROUGH, comma separated). */
  passthrough?: string[];
  extra?: Record<string, string>;
}

export function scrubEnv(env: NodeJS.ProcessEnv, options: ScrubOptions = {}): Record<string, string> {
  const allowed = new Set([...ENV_ALLOWLIST, ...(options.passthrough ?? [])]);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (!allowed.has(key) && !key.startsWith('LC_')) continue;
    // A proxy URL with user:password@ carries a credential.
    if (PROXY_VARS.has(key) && /\/\/[^/]*@/.test(value)) continue;
    out[key] = value;
  }
  return { ...out, ...options.extra };
}

export function truncateOutput(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  const head = Math.floor(maxChars * 0.8);
  const tail = maxChars - head;
  const marker =
    `\n\n[trod: output truncated: ${text.length} chars total, showing the first ${head} and the last ${tail}. ` +
    `Narrow the input or make the tool filter or summarize its output.]\n\n`;
  return { text: text.slice(0, head) + marker + text.slice(text.length - tail), truncated: true };
}

export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? String(value);
}

/**
 * Loads a run.mjs, calls its default export with the input from stdin and writes the outcome to
 * fd 3, so that whatever the tool prints with console.log does not mix with the result.
 */
const MJS_RUNNER = `
import { pathToFileURL } from 'node:url';
import { writeSync } from 'node:fs';
const send = (msg) => { try { writeSync(3, JSON.stringify(msg)); } catch { process.stderr.write('trod: could not write result\\n'); } };
let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;
try {
  const input = raw ? JSON.parse(raw) : {};
  const mod = await import(pathToFileURL(process.env.TROD_RUN_PATH).href);
  const fn = typeof mod.default === 'function' ? mod.default : mod.run;
  if (typeof fn !== 'function') throw new Error('run.mjs must default-export a function: export default async (input, ctx) => result');
  const ctx = {
    projectDir: process.env.TROD_PROJECT_DIR,
    toolDir: process.env.TROD_TOOL_DIR,
    toolName: process.env.TROD_TOOL_NAME,
    sessionId: process.env.TROD_SESSION_ID || undefined,
    log: (...args) => console.error(...args),
  };
  let value = await fn(input, ctx);
  if (value === undefined) value = null;
  let json;
  try { json = JSON.stringify(value); } catch (e) { json = JSON.stringify(String(value)); }
  writeSync(3, '{"ok":true,"value":' + (json ?? 'null') + '}');
  process.exit(0);
} catch (err) {
  send({ ok: false, error: err && err.stack ? String(err.stack) : String(err) });
  process.exit(1);
}
`;

export interface ExecuteOptions {
  runner: RunnerKind;
  runPath: string;
  toolDir: string;
  toolName: string;
  projectDir: string;
  input: unknown;
  timeoutMs?: number;
  maxOutputChars?: number;
  sessionId?: string;
  env?: NodeJS.ProcessEnv;
}

function tail(text: string, n = 2000): string {
  return text.length > n ? '…' + text.slice(text.length - n) : text;
}

export function executeTool(opts: ExecuteOptions): Promise<RunResult> {
  const started = performance.now();
  const timeoutMs = Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const maxOutputChars = opts.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  const parentEnv = opts.env ?? process.env;
  const passthrough = (parentEnv.TROD_ENV_PASSTHROUGH ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const env = scrubEnv(parentEnv, {
    passthrough,
    extra: {
      TROD_PROJECT_DIR: opts.projectDir,
      TROD_TOOL_DIR: opts.toolDir,
      TROD_TOOL_NAME: opts.toolName,
      TROD_RUN_PATH: opts.runPath,
      ...(opts.sessionId ? { TROD_SESSION_ID: opts.sessionId } : {}),
    },
  });

  const [command, args] =
    opts.runner === 'mjs'
      ? [process.execPath, ['--input-type=module', '-e', MJS_RUNNER]]
      : ['bash', [opts.runPath]];

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.projectDir,
      env,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let fd3 = '';
    let timedOut = false;
    let settled = false;
    const cap = (buf: string, chunk: Buffer) => (buf.length < MAX_CAPTURE_BYTES ? buf + chunk.toString('utf8') : buf);
    child.stdout!.on('data', (c: Buffer) => (stdout = cap(stdout, c)));
    child.stderr!.on('data', (c: Buffer) => (stderr = cap(stderr, c)));
    const resultPipe = child.stdio[3] as NodeJS.ReadableStream | null;
    resultPipe?.on('data', (c: Buffer) => (fd3 = cap(fd3, c)));

    const killTree = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    const finish = (partial: { ok: boolean; value?: unknown; text: string; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const { text, truncated } = truncateOutput(partial.text, maxOutputChars);
      resolve({
        ok: partial.ok,
        value: partial.value,
        error: partial.error,
        text,
        truncated,
        outputChars: partial.text.length,
        durationMs: Math.round(performance.now() - started),
        timedOut,
      });
    };

    child.on('error', (err) => finish({ ok: false, error: err.message, text: `trod: could not start tool: ${err.message}` }));
    child.on('close', (code, signal) => {
      // Kill anything the tool left running in its process group.
      killTree();
      if (timedOut) {
        const msg = `trod: tool timed out after ${timeoutMs} ms and was killed.`;
        finish({ ok: false, error: msg, text: msg + (stderr ? `\nstderr:\n${tail(stderr)}` : '') });
        return;
      }
      if (opts.runner === 'mjs') {
        let msg: { ok: boolean; value?: unknown; error?: string } | undefined;
        try {
          msg = fd3 ? JSON.parse(fd3) : undefined;
        } catch {
          msg = undefined;
        }
        if (msg?.ok) {
          let value = msg.value;
          // A tool that printed its answer instead of returning it.
          if ((value === null || value === undefined) && stdout.trim()) value = stdout;
          finish({ ok: true, value, text: formatValue(value) });
          return;
        }
        const error = msg?.error ?? `tool process exited with ${signal ?? `code ${code}`}`;
        const extra = [stderr && `stderr:\n${tail(stderr)}`, stdout && `stdout:\n${tail(stdout)}`].filter(Boolean).join('\n');
        finish({ ok: false, error: error.split('\n')[0], text: `Error: ${error}${extra ? '\n' + extra : ''}` });
        return;
      }
      if (code === 0) {
        let value: unknown = stdout;
        const trimmed = stdout.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            value = JSON.parse(trimmed);
          } catch {
            value = stdout;
          }
        }
        finish({ ok: true, value, text: stdout });
        return;
      }
      const error = `run.sh exited with ${signal ?? `code ${code}`}`;
      finish({
        ok: false,
        error,
        text: `Error: ${error}` + (stderr ? `\nstderr:\n${tail(stderr)}` : '') + (stdout ? `\nstdout:\n${tail(stdout)}` : ''),
      });
    });

    child.stdin!.on('error', () => {});
    child.stdin!.end(JSON.stringify(opts.input ?? {}));
  });
}
