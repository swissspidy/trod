/**
 * Produces the notes for round 19's arms, each in its own workspace, as another OS user, with the service running.
 * Needs root (it chowns the workspace and runs the session with runuser) and an API key.
 *
 *   node experiments/private/produce.ts init   <out dir> [--model m]   # Claude Code's /init: the generated AGENTS.md arm
 *   node experiments/private/produce.ts forge  <out dir> [--practice]  # trod forge, with or without practice on train tasks
 *   node experiments/private/produce.ts learn  <out dir> <runs dir>     # trod learn over the train runs in <runs dir>
 *
 * Options: --model (default claude-opus-5-5), --budget USD (default 3), --as-user (default agent), --plugin <dir>
 * (a readable copy of plugin/, default /srv/r19/plugin). Each writes <out dir>/notes.md and <out dir>/cost.json.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { COMMON, grade, handler, questions, world, writeWorkspace } from './zorbit.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: 'string', default: 'claude-opus-5-5' },
    budget: { type: 'string', default: '3' },
    'as-user': { type: 'string', default: 'agent' },
    plugin: { type: 'string', default: '/srv/r19/plugin' },
    practice: { type: 'boolean', default: false },
  },
});
const [mode, outArg, runsArg] = positionals;
if (!mode || !outArg || !['init', 'forge', 'learn'].includes(mode) || (mode === 'learn' && !runsArg)) {
  console.error('usage: produce.ts init|forge|learn <out dir> [<runs dir> for learn] [--practice] [--model m] [--budget usd]');
  process.exit(1);
}
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TEST_API_KEY;
if (!apiKey) throw new Error('set ANTHROPIC_API_KEY or TEST_API_KEY');
const out = path.resolve(outArg);
rmSync(out, { recursive: true, force: true });
const work = path.join(out, 'work');
const home = path.join(out, 'home');
mkdirSync(work, { recursive: true });
mkdirSync(path.join(home, 'tmp'), { recursive: true });

const env: Record<string, string> = {
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  HOME: home,
  TMPDIR: path.join(home, 'tmp'),
  CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
  ANTHROPIC_API_KEY: apiKey,
  DISABLE_AUTOUPDATER: '1',
  DISABLE_TELEMETRY: '1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
};
for (const k of ['NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'LANG']) if (process.env[k]) env[k] = process.env[k]!;
env.NO_PROXY = env.no_proxy = [process.env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');

function runAs(cmd: string, args: string[], cwd: string): Promise<{ code: number; stdout: string }> {
  spawnSyncChown(out);
  return new Promise((resolve) => {
    const vars = Object.entries(env).map(([k, v]) => `${k}=${v}`);
    const child = spawn('runuser', ['-u', values['as-user']!, '--', 'env', '-i', ...vars, cmd, ...args], { cwd, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.on('data', (c) => {
      stdout += c;
      process.stdout.write(c);
    });
    child.on('exit', (code) => resolve({ code: code ?? 1, stdout }));
  });
}
function spawnSyncChown(dir: string) {
  spawnSync('chown', ['-R', `${values['as-user']}:`, dir]);
}

// The service, with practice endpoints that cycle through the train questions.
const train = questions().filter((q) => q.split === 'train');
let current = -1;
const practiceLog: { question: string; pass: boolean }[] = [];
const token = randomBytes(12).toString('hex');
const server = createServer(
  handler(world(), {
    token,
    reset: () => {
      current = (current + 1) % train.length;
      return train[current]!.text;
    },
    attempt: (body) => {
      if (current < 0) return { pass: false, score: 0, details: 'no question yet: run trod-reset first' };
      const r = grade(train[current]!, body);
      practiceLog.push({ question: train[current]!.id, pass: r.pass });
      return { ...r, details: r.pass ? 'correct' : 'wrong answer' };
    },
  }),
);
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
writeWorkspace(work);
mkdirSync(path.join(work, '.service'), { recursive: true });
writeFileSync(path.join(work, '.service', 'base-url'), base + '\n');

const trod = path.join(values.plugin!, 'bin', 'trod');
const examples = [...new Set(train.map((q) => q.kind))].map((k) => train.find((q) => q.kind === k)!.text);
const brief = `${COMMON}

Future sessions will each answer one question about Zorbit's data and write it to answer.json as {"answer": ...}, amounts as integers in cents. Examples of such questions:

${examples.map((e) => `- ${e}`).join('\n')}`;

let cost = 0;
try {
  if (mode === 'init') {
    // Claude Code's own /init, as a user would run it in this workspace (the ETH study's "LLM-generated" condition).
    const r = await runAs('claude', ['-p', '/init', '--model', values.model!, '--output-format', 'json', '--max-budget-usd', values.budget!, '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep'], work);
    cost = JSON.parse(r.stdout.trim().split('\n').pop()!).total_cost_usd ?? 0;
    const file = ['CLAUDE.md', 'AGENTS.md'].map((f) => path.join(work, f)).find((f) => existsSync(f) && readFileSync(f, 'utf8') !== '');
    if (!file) throw new Error('/init wrote no CLAUDE.md');
    copyFileSync(file, path.join(out, 'notes.md'));
  } else if (mode === 'forge') {
    writeFileSync(path.join(out, 'brief.md'), brief);
    const practice = values.practice
      ? ['--practice', `curl -s -X POST -H 'x-zb-practice: ${token}' --data-binary @answer.json ${base}/_practice/try | tee /dev/stderr | grep -q '"pass":true'`, '--reset', `rm -f answer.json; curl -s -X POST -H 'x-zb-practice: ${token}' ${base}/_practice/reset`]
      : [];
    const r = await runAs(process.execPath, [trod, 'forge', '--dir', work, '--brief', `@${path.join(out, 'brief.md')}`, '--model', values.model!, '--budget', values.budget!, '--stream', path.join(out, 'forge.jsonl'), '--json', ...practice], work);
    cost = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).costUsd ?? 0;
    copyFileSync(path.join(work, '.trod', 'notes.md'), path.join(out, 'notes.md'));
  } else {
    // The train runs' streams, named by run, with pass or fail from the grader: what trod learn reads.
    const runs = path.resolve(runsArg!);
    const sessions = path.join(out, 'sessions');
    mkdirSync(sessions, { recursive: true });
    const outcomes: Record<string, boolean> = {};
    for (const task of readdirSync(runs)) {
      for (const run of readdirSync(path.join(runs, task))) {
        const dir = path.join(runs, task, run);
        const result = path.join(dir, 'result.json');
        const stream = path.join(dir, 'stream-1.jsonl');
        if (!existsSync(result) || !existsSync(stream)) continue;
        const r = JSON.parse(readFileSync(result, 'utf8'));
        if (r.check?.infra) continue;
        const name = `${task}-${run}`;
        copyFileSync(stream, path.join(sessions, `${name}.jsonl`));
        outcomes[name] = !!r.check?.pass;
      }
    }
    writeFileSync(path.join(out, 'outcomes.json'), JSON.stringify(outcomes, null, 2));
    console.log(`learning from ${Object.keys(outcomes).length} sessions, ${Object.values(outcomes).filter(Boolean).length} passed`);
    const r = await runAs(process.execPath, [trod, 'learn', '--dir', work, '--from', sessions, '--outcomes', path.join(out, 'outcomes.json'), '--model', values.model!, '--budget', values.budget!, '--stream', path.join(out, 'learn.jsonl'), '--json'], work);
    cost = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).costUsd ?? 0;
    copyFileSync(path.join(work, '.trod', 'notes.md'), path.join(out, 'notes.md'));
  }
} finally {
  server.close();
  const notes = existsSync(path.join(out, 'notes.md')) ? readFileSync(path.join(out, 'notes.md'), 'utf8') : '';
  writeFileSync(path.join(out, 'cost.json'), JSON.stringify({ mode, practice: values.practice, model: values.model, costUsd: cost, notesChars: notes.length, practiceAttempts: practiceLog.length, practicePassed: practiceLog.filter((p) => p.pass).length }, null, 2));
  console.log(`\n${mode}: $${cost.toFixed(3)}, notes ${notes.length} chars${practiceLog.length ? `, practice ${practiceLog.filter((p) => p.pass).length}/${practiceLog.length}` : ''}`);
}
