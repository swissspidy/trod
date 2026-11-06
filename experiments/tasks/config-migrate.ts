import type { Task, TaskContext } from '../lib/types.ts';
import { readJson, rng, same, write } from '../lib/util.ts';

const NAMES = ['billing', 'search', 'auth', 'gateway', 'mailer', 'reports', 'images', 'queue', 'cache', 'audit'];
const DIRS = [
  { dir: 'configs', n: 30 },
  { dir: 'configs-staging', n: 15 },
  { dir: 'configs-prod', n: 15 },
];

function batch(step: number) {
  const r = rng(808 + step * 1000);
  const files: Record<string, string> = {};
  const expected: Record<string, unknown> = {};
  for (let i = 1; i <= DIRS[step]!.n; i++) {
    const name = `${r.pick(NAMES)}-${i}`;
    const port = r.int(1024, 9999);
    const debug = r.chance(0.5);
    const hosts = Array.from({ length: r.int(1, 4) }, (_, j) => `${name}-${j}.internal`);
    const timeoutMs = r.pick([500, 1500, 5000, 30000, 120000, null]);
    const v1: Record<string, unknown> = {
      name,
      port: r.chance(0.5) ? String(port) : port,
      debug: debug ? r.pick(['yes', 'true', 'on', 1, true]) : r.pick(['no', 'false', 'off', 0, false]),
      hosts: r.chance(0.7) ? hosts.join(r.pick([',', ', ', ' , '])) + (r.chance(0.2) ? ',' : '') : hosts,
    };
    if (timeoutMs !== null) {
      v1.timeout = timeoutMs % 60000 === 0 && r.chance(0.5) ? `${timeoutMs / 60000}m` : timeoutMs % 1000 === 0 ? r.pick([`${timeoutMs / 1000}s`, timeoutMs / 1000]) : `${timeoutMs}ms`;
    }
    const extra: Record<string, unknown> = {};
    if (r.chance(0.4)) extra.owner = r.pick(['team-a', 'team-b', 'platform']);
    if (r.chance(0.3)) extra.tags = ['prod', name];
    Object.assign(v1, extra);
    files[`${name}.json`] = JSON.stringify(v1, null, r.chance(0.5) ? 2 : 0) + '\n';
    expected[`${name}.json`] = { version: 2, service: { name, port }, debug, hosts, timeoutMs: timeoutMs ?? 5000, ...extra };
  }
  return { files, expected };
}

function writeBatch({ work }: TaskContext, step: number) {
  for (const [f, c] of Object.entries(batch(step).files)) write(work, `${DIRS[step]!.dir}/${f}`, c);
}

const check = (step: number) => ({ work }: TaskContext, expected: Record<string, unknown>[]) => {
  let ok = 0;
  const bad: string[] = [];
  const want = expected[step]!;
  for (const [file, v] of Object.entries(want)) {
    const got = readJson(work, `${DIRS[step]!.dir}/${file}`);
    if (got.ok && same(got.value, v)) ok++;
    else bad.push(`${file}: ${got.ok ? JSON.stringify(got.value).slice(0, 160) : got.error}`);
  }
  const n = Object.keys(want).length;
  return { pass: ok === n, score: ok / n, details: `${ok}/${n} files correct` + (bad.length ? `; ${bad.slice(0, 3).join('; ')}` : '') };
};

/** Migrate JSON configs from schema v1 to v2, for three environments. */
const task: Task = {
  id: 'config-migrate',
  title: 'Migrate service configs from v1 to v2 (30, then 15, then 15)',
  kind: 'repetitive',
  repetitions: 30,
  setup: (ctx) => {
    writeBatch(ctx, 0);
    return [0, 1, 2].map((s) => batch(s).expected);
  },
  prepareStep: writeBatch,
  steps: [
    {
      prompt: () => `configs/ contains 30 service configuration files (*.json) in the old v1 format, for example:

    {"name": "billing", "port": "8080", "debug": "yes", "hosts": "a.internal, b.internal", "timeout": "30s"}

Rewrite each file in place to the v2 format:

    {"version": 2, "service": {"name": "billing", "port": 8080}, "debug": true, "hosts": ["a.internal", "b.internal"], "timeoutMs": 30000}

Rules:
- port: integer (v1 has a number or a numeric string)
- debug: boolean; v1 uses "yes"/"no", "true"/"false", "on"/"off", 1/0 or true/false
- hosts: array of trimmed, non-empty host names in their original order; v1 has a comma-separated string or already an array
- timeout: v1 has a number of seconds or a string with a unit: "500ms", "30s", "2m"; v2 has timeoutMs as an integer. If v1 has no timeout, use 5000.
- keep any other keys unchanged, at the top level
- files must be valid JSON (formatting does not matter)
Other environments will need the same migration later. When finished, reply DONE.`,
      check: check(0),
    },
    {
      prompt: () => `Now the staging environment: configs-staging/ has 15 v1 files. Migrate them in place the same way. When finished, reply DONE.`,
      check: check(1),
    },
    {
      prompt: () => `Finally production: configs-prod/ has 15 v1 files. Migrate them in place the same way. When finished, reply DONE.`,
      check: check(2),
    },
  ],
};
export default task;
