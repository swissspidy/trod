/**
 * SWE-bench Verified instances as experiment tasks, graded locally without Docker.
 *
 * Data and environments live in SWE_HOME (default experiments/swe/.cache), prepared by experiments/swe/setup.sh:
 *   verified.json            the dataset (princeton-nlp/SWE-bench_Verified, test split)
 *   repos/<name>.git         bare clones
 *   venv-<env>/              a virtualenv with the repository's test dependencies, resolved as of the era
 *
 * Every session gets `git archive <base_commit>` in a fresh repository with no history, so the fix cannot be looked
 * up in later commits. Grading follows SWE-bench: test files touched by the test patch are reset, the test patch is
 * applied, the affected test modules run, and the instance counts as resolved when every FAIL_TO_PASS and
 * PASS_TO_PASS test passes.
 */
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CheckResult, Task, TaskContext } from '../lib/types.ts';

const execFileAsync = promisify(execFile);

export const SWE_HOME = path.resolve(process.env.SWE_HOME ?? path.join(import.meta.dirname, '.cache'));

export interface Instance {
  repo: string;
  instance_id: string;
  base_commit: string;
  patch: string;
  test_patch: string;
  problem_statement: string;
  version: string;
  FAIL_TO_PASS: string;
  PASS_TO_PASS: string;
  difficulty: string;
  created_at: string;
}

export function loadInstances(): Instance[] {
  const file = path.join(SWE_HOME, 'verified.json');
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf8')) as Instance[];
}

/** One environment = one repository line that a single virtualenv serves, and one forge. */
export interface SweEnv {
  key: string;
  repo: string;
  versions: string[];
  gitDir: string;
  venv: string;
  /** The forge's checkout: a commit before every instance in the sample, so no fix is visible. */
  forgeCommit: string;
}

export const DJANGO4: SweEnv = {
  key: 'swe-django4',
  repo: 'django/django',
  versions: ['4.0', '4.1'],
  gitDir: path.join(SWE_HOME, 'repos', 'django.git'),
  venv: path.join(SWE_HOME, 'venv-django4'),
  forgeCommit: '', // filled in by sweTasks: the parent of the earliest base commit in the environment
};

function sh(cmd: string, args: string[], opts: { cwd?: string; input?: string } = {}): string {
  return execFileSync(cmd, args, { cwd: opts.cwd, input: opts.input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
}

/** A fresh repository holding exactly the tree of `commit`, with a single commit and no history. */
export function exportCommit(gitDir: string, commit: string, work: string): void {
  execFileSync('bash', ['-c', `git --git-dir="$1" archive "$2" | tar -x -C "$3"`, '_', gitDir, commit, work]);
  sh('git', ['init', '-q'], { cwd: work });
  sh('git', ['add', '-A'], { cwd: work });
  sh('git', ['-c', 'user.name=swe', '-c', 'user.email=swe@example.com', 'commit', '-q', '-m', 'base'], { cwd: work });
}

export function envVars(env: SweEnv, work: string): Record<string, string> {
  return {
    PATH: `${path.join(env.venv, 'bin')}:${process.env.PATH ?? ''}`,
    VIRTUAL_ENV: env.venv,
    PYTHONPATH: work,
    // trod tools see PYTHONPATH and VIRTUAL_ENV too (the executor's allowlist drops everything else).
    TROD_ENV_PASSTHROUGH: 'PYTHONPATH,VIRTUAL_ENV',
  };
}

/** Files a unified diff touches. */
function patchedFiles(patch: string): string[] {
  return [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map((m) => m[2]!);
}

/** "test_x (app.tests.Class)" -> "app.tests" (the module label runtests.py takes). */
function moduleOf(name: string): string | undefined {
  const m = name.match(/^\S+ \(([\w.]+)\)$/);
  if (!m) return undefined;
  const parts = m[1]!.split('.');
  return parts.slice(0, -1).join('.');
}

/** Per-test statuses from `runtests.py -v 2` output, keyed like SWE-bench's FAIL_TO_PASS / PASS_TO_PASS entries. */
export function parseDjangoLog(log: string): Map<string, string> {
  const status = new Map<string, string>();
  const lines = log.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^(.*?) \.\.\. ?(ok|FAIL|ERROR|skipped.*|expected failure|unexpected success)\s*$/);
    if (!m) continue;
    const s = m[2]!.startsWith('skipped') ? 'skipped' : m[2]!;
    status.set(m[1]!.trim(), s);
    // With a docstring, unittest prints "test_x (mod.Class)" on its own line and the docstring before " ... ok".
    const prev = lines[i - 1]?.trim();
    if (prev && /^\w+ \([\w.]+\)$/.test(prev)) status.set(prev, s);
  }
  return status;
}

export async function grade(env: SweEnv, inst: Instance, work: string): Promise<CheckResult> {
  // Reset the test files the test patch touches, then apply it.
  for (const f of patchedFiles(inst.test_patch)) {
    try {
      sh('git', ['cat-file', '-e', `HEAD:${f}`], { cwd: work });
      sh('git', ['checkout', 'HEAD', '--', f], { cwd: work });
    } catch {
      rmSync(path.join(work, f), { force: true });
    }
  }
  try {
    sh('git', ['apply', '--whitespace=nowarn', '-'], { cwd: work, input: inst.test_patch });
  } catch (err) {
    return { pass: false, score: 0, details: `test patch does not apply: ${(err as Error).message.slice(0, 200)}` };
  }
  const f2p = JSON.parse(inst.FAIL_TO_PASS) as string[];
  const p2p = JSON.parse(inst.PASS_TO_PASS) as string[];
  const labels = [...new Set([...f2p, ...p2p].map(moduleOf).filter((x): x is string => !!x))];
  let log = '';
  try {
    const res = await execFileAsync(path.join(env.venv, 'bin', 'python'), ['tests/runtests.py', '--verbosity', '2', '--parallel', '1', ...labels], {
      cwd: work,
      env: { ...process.env, ...envVars(env, work), PYTHONDONTWRITEBYTECODE: '1' },
      timeout: 20 * 60_000,
      maxBuffer: 256 * 1024 * 1024,
    });
    log = res.stdout + res.stderr;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    log = (e.stdout ?? '') + (e.stderr ?? '');
  }
  const st = parseDjangoLog(log);
  const ok = (n: string) => st.get(n) === 'ok' || st.get(n) === 'expected failure';
  const f2pOk = f2p.filter(ok).length;
  // A PASS_TO_PASS test skipped here (an optional dependency missing in this environment) cannot have been broken.
  const p2pBad = p2p.filter((n) => !ok(n) && st.get(n) !== 'skipped');
  const pass = f2pOk === f2p.length && p2pBad.length === 0;
  return {
    pass,
    score: pass ? 1 : 0,
    details: `FAIL_TO_PASS ${f2pOk}/${f2p.length}, PASS_TO_PASS broken ${p2pBad.length}/${p2p.length}` + (p2pBad.length ? ` (e.g. ${p2pBad.slice(0, 2).join('; ')})` : '') + (!pass && f2pOk < f2p.length ? ` (failing: ${f2p.filter((n) => !ok(n)).slice(0, 2).map((n) => `${n}=${st.get(n) ?? 'not run'}`).join('; ')})` : ''),
  };
}

const PROMPT = (inst: Instance) => `You are working in a checkout of the ${inst.repo} repository (current directory). A Python environment with the project and its test dependencies is active.

Resolve the following issue by changing the repository's source code. Do not modify the existing tests to make them pass; you may add tests. Hidden tests will check your fix.

<issue>
${inst.problem_statement.trim()}
</issue>

When finished, reply DONE.`;

const DJANGO_BRIEF = (env: SweEnv) => `A checkout of the Django source repository (${env.repo}, a 4.0-era commit) in the current directory, without git history. A Python 3.9 virtualenv with Django's test dependencies is active (python on PATH; PYTHONPATH points at the checkout, so \`import django\` loads this source tree).

Future sessions will each start in a fresh checkout of Django at some commit of the 4.0/4.1 line and fix one bug reported on Django's issue tracker. They may be run by a smaller, cheaper model that has never worked on Django. They need to understand the reported behaviour, find the code responsible, make a fix, and check it with Django's own test suite.

Build tools that make that fast and reliable, for example:
- running specific Django tests (by module, class or test name) the way this repository expects, and returning a compact summary: counts, the failing tests, and the relevant lines of each traceback (not the whole log)
- running a short Python snippet against this source tree with Django configured (settings, database), to reproduce reported behaviour
- locating where a name is defined and where it is used across django/ (and finding the tests that cover a module)
Tools must work in any checkout of Django 4.x: read everything from ctx.projectDir at runtime, and do not hardcode line numbers or anything specific to the current commit.`;

export function sweTasks(env: SweEnv = DJANGO4, ids?: string[]): Task[] {
  const all = loadInstances().filter((i) => i.repo === env.repo && env.versions.includes(i.version));
  if (!all.length) return [];
  const earliest = [...all].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!;
  const e: SweEnv = { ...env, forgeCommit: env.forgeCommit || `${earliest.base_commit}~1` };
  return all
    .filter((i) => !ids || ids.includes(i.instance_id))
    .map(
      (inst): Task => ({
        id: inst.instance_id,
        title: `SWE-bench Verified ${inst.instance_id} (${inst.difficulty})`,
        kind: 'repetitive',
        repetitions: 1,
        forgeKey: e.key,
        setup: ({ work }: TaskContext) => {
          exportCommit(e.gitDir, inst.base_commit, work);
          return { instance_id: inst.instance_id };
        },
        forgeSetup: ({ work }: TaskContext) => exportCommit(e.gitDir, e.forgeCommit, work),
        env: ({ work }: TaskContext) => envVars(e, work),
        toolsmithBrief: () => DJANGO_BRIEF(e),
        steps: [{ prompt: () => PROMPT(inst), check: ({ work }: TaskContext) => grade(e, inst, work) }],
      }),
    );
}

export { DJANGO_BRIEF };
