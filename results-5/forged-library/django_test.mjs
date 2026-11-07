import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const meta = {
  provenance: { reason: 'Toolsmith session: helpers for fixing Django 4.x bugs (run tests, reproduce, navigate code).' },
  description:
    "Runs Django's own test suite (tests/runtests.py, SQLite settings test_sqlite) for the given labels and returns a compact summary: " +
    "{ok, command, ran, counts:{passed,failures,errors,skipped,expectedFailures,unexpectedSuccesses,failingTests (distinct tests with a FAIL/ERROR; failures counts each failing subTest)}, summaryLine, durationSec, " +
    "problems:[{kind:'FAIL'|'ERROR'|'UNEXPECTED SUCCESS', test:'label.of.Class.test_method', subtest:'(i=1)'|null, location:'django/x.py:123 in func' (deepest frame inside the checkout), " +
    "traceback:'trimmed: only frames inside the checkout, paths relative, exception message/diff capped'}], " +
    "skipped:[{test,reason}] (only when listSkipped), statuses:{label:'ok'|'FAIL'|...} (only when listStatuses), crash:'trimmed traceback or output tail' when the run aborted before/without a result (syntax error, bad settings), stdoutNoise (stray output printed after the summary, capped)}. " +
    "Labels may be dotted ('queries', 'queries.tests', 'queries.tests.Queries1Tests', 'queries.tests.Queries1Tests.test_ticket7') or file paths " +
    "('tests/queries/tests.py', 'tests/queries/tests.py::Queries1Tests::test_ticket7'); unknown labels/missing methods appear as ERROR problems with an ImportError/AttributeError.",
  whenToUse:
    "Whenever you need to run Django tests: to reproduce a bug with a new/existing test, and to check a fix against the related test modules (run the whole app dir, e.g. ['queries','expressions'], before finishing). " +
    "Handles cwd, PYTHONPATH (always this checkout), --noinput, verbosity parsing, subTest blocks and parallel output. Default parallel=1 for <=3 labels that name a class/method, otherwise min(4, CPUs). " +
    "Use k (substring/glob passed to runtests -k) to select test methods by name across the labels. Whole-suite runs (no labels) take many minutes: give explicit labels. " +
    "Tests needing PostgreSQL/MySQL/GIS/selenium are skipped on SQLite; that is expected.",
  inputSchema: {
    type: 'object',
    properties: {
      labels: { type: 'array', items: { type: 'string' }, description: "Test labels or file paths, e.g. ['utils_tests.test_text', 'tests/queries/test_q.py::QTests']" },
      k: { type: 'array', items: { type: 'string' }, description: 'Only run test methods/classes matching these patterns (runtests -k, substring or glob like *json*).' },
      parallel: { type: 'integer', minimum: 1, description: 'Number of processes (default auto, see whenToUse).' },
      failfast: { type: 'boolean', description: 'Stop at first failure.' },
      settings: { type: 'string', description: "Settings module (default test_sqlite, the one runtests uses)." },
      timeoutSec: { type: 'integer', minimum: 10, maximum: 590, description: 'Kill the run after this many seconds (default 540).' },
      maxProblems: { type: 'integer', minimum: 1, description: 'Max failures/errors to detail (default 15).' },
      maxTracebackLines: { type: 'integer', minimum: 5, description: 'Max lines per trimmed traceback (default 30).' },
      listSkipped: { type: 'boolean', description: 'Include skipped tests with reasons.' },
      listStatuses: { type: 'boolean', description: 'Include per-test status map (can be large).' },
      extraArgs: { type: 'array', items: { type: 'string' }, description: "Extra runtests.py args, e.g. ['--reverse'], ['--debug-sql'], ['--tag','x']." },
    },
    additionalProperties: false,
  },
  examples: [
    {
      input: { labels: ['utils_tests.test_text'], k: ['slugify'] },
      expect: { matches: '"ok":\\s*true' },
    },
    {
      input: { labels: ['tests/utils_tests/test_text.py::TestUtilsText::test_does_not_exist'] },
      expect: { contains: 'test_does_not_exist' },
    },
  ],
  timeoutMs: 600000,
};

function toLabel(raw, projectDir) {
  let s = raw.trim();
  let rest = [];
  if (s.includes('::')) {
    const parts = s.split('::');
    s = parts[0];
    rest = parts.slice(1).filter(Boolean);
  }
  if (s.endsWith('.py') || s.includes('/')) {
    let p = s.replace(/\\/g, '/');
    if (path.isAbsolute(p)) p = path.relative(projectDir, p);
    p = p.replace(/^\.\//, '');
    if (p.startsWith('tests/')) p = p.slice(6);
    p = p.replace(/\.py$/, '').replace(/\/__init__$/, '').replace(/\/+$/, '');
    s = p.split('/').join('.');
  }
  return [s, ...rest].join('.');
}

function trimTraceback(lines, projectDir, maxLines) {
  // lines: the block body after the '-----' separator.
  const out = [];
  let location = null;
  let i = 0;
  const pre = [];
  // Lines before "Traceback" (e.g. "ImportError: Failed to import test module: x")
  while (i < lines.length && !lines[i].startsWith('Traceback (most recent call last)')) {
    if (lines[i].trim()) pre.push(lines[i]);
    i++;
  }
  if (i >= lines.length) {
    return { text: pre.slice(0, maxLines).join('\n'), location: null };
  }
  out.push(...pre);
  i++; // skip Traceback header
  const frames = [];
  let excLines = [];
  while (i < lines.length) {
    const l = lines[i];
    const m = l.match(/^  File "(.+)", line (\d+), in (.+)$/);
    if (m) {
      const code = i + 1 < lines.length && lines[i + 1].startsWith('    ') ? lines[i + 1].trim() : '';
      frames.push({ file: m[1], line: m[2], func: m[3], code });
      i += code ? 2 : 1;
      // skip caret lines (py3.11+)
      while (i < lines.length && /^\s+[\^~]+\s*$/.test(lines[i])) i++;
      continue;
    }
    if (/^(During handling of the above exception|The above exception was the direct cause)/.test(l)) {
      excLines.push('[chained] ' + l.trim());
      i++;
      continue;
    }
    if (l.startsWith('Traceback (most recent call last)')) { i++; continue; }
    excLines.push(l);
    i++;
  }
  const inProj = (f) => f.startsWith(projectDir + path.sep);
  let keep = frames.filter((f) => inProj(f.file) && !/\/django\/test\/(testcases|utils)\.py$/.test(f.file) || false);
  if (!keep.length) keep = frames.slice(-1); // only stdlib frames (e.g. import failure): show the last one
  const shown = keep.slice(-12);
  if (keep.length > shown.length) out.push(`  ... ${keep.length - shown.length} earlier frames omitted`);
  for (const f of shown) {
    const rel = inProj(f.file) ? path.relative(projectDir, f.file) : f.file;
    out.push(`  ${rel}:${f.line} in ${f.func}${f.code ? '  |  ' + f.code : ''}`);
  }
  const deep = [...frames].reverse().find((f) => inProj(f.file) && !f.file.includes('/django/test/'));
  if (deep) location = `${path.relative(projectDir, deep.file)}:${deep.line} in ${deep.func}`;
  while (excLines.length && !excLines[excLines.length - 1].trim()) excLines.pop();
  out.push(...excLines);
  let text = out.join('\n').split(projectDir + path.sep).join('');
  const tl = text.split('\n');
  if (tl.length > maxLines) text = tl.slice(0, maxLines - 1).join('\n') + `\n  ... (${tl.length - maxLines + 1} more lines)`;
  return { text, location };
}

function parseTestId(header) {
  // "test_x (mod.Class)" | "test_x (mod.Class) (i=1)" | "test_x (mod.Class.test_x)" | "setUpClass (mod.Class)"
  const m = header.match(/^(\S+) \(([^)]+)\)(?: (.*))?$/);
  if (!m) return { test: header, subtest: null };
  let [, name, cls, sub] = m;
  let test;
  if (cls.endsWith('.' + name)) test = cls;
  else if (cls === 'unittest.loader._FailedTest' || cls === 'unittest.loader.ModuleImportFailure') test = name;
  else test = `${cls}.${name}`;
  if (sub) sub = sub.replace(/\[<object object at 0x[0-9a-f]+>\]\s*/g, '').trim();
  return { test, subtest: sub || null };
}

export default async function run(input, ctx) {
  const projectDir = ctx.projectDir;
  const testsDir = path.join(projectDir, 'tests');
  if (!fs.existsSync(path.join(testsDir, 'runtests.py'))) throw new Error(`tests/runtests.py not found under ${projectDir}`);
  const labels = (input.labels || []).map((l) => toLabel(l, projectDir)).filter(Boolean);
  let parallel = input.parallel;
  if (!parallel) {
    const fine = labels.length > 0 && labels.length <= 3 && labels.every((l) => /\.[A-Z]\w*(\.\w+)?$/.test(l) || /\.test_\w+$/.test(l));
    parallel = fine ? 1 : Math.max(1, Math.min(4, os.cpus().length));
  }
  const args = ['-u', 'runtests.py', '-v', '2', '--noinput', '--parallel', String(parallel)];
  if (input.failfast) args.push('--failfast');
  if (input.settings) args.push('--settings', input.settings);
  for (const k of input.k || []) args.push('-k', k);
  if (input.extraArgs) args.push(...input.extraArgs);
  args.push(...labels);
  const env = { ...process.env };
  env.PYTHONPATH = [projectDir, ...(env.PYTHONPATH || '').split(':').filter((p) => p && p !== projectDir)].join(':');
  env.PYTHONDONTWRITEBYTECODE = '1';
  env.PYTHONUNBUFFERED = '1';
  delete env.DJANGO_SETTINGS_MODULE;
  const timeoutSec = input.timeoutSec || 540;
  const t0 = Date.now();
  const { output, code, timedOut } = await new Promise((resolve) => {
    const child = spawn('python', args, { cwd: testsDir, env });
    let buf = '';
    child.stdout.on('data', (d) => (buf += d));
    child.stderr.on('data', (d) => (buf += d));
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutSec * 1000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ output: buf, code, timedOut }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ output: buf + '\n' + String(e), code: -1, timedOut }); });
  });
  const durationSec = Math.round((Date.now() - t0) / 100) / 10;
  const lines = output.split('\n');
  const maxProblems = input.maxProblems || 15;
  const maxTb = input.maxTracebackLines || 30;

  // statuses
  const statuses = {};
  const statusRe = /(\S+ \([\w.]+\)(?: \([^)]*\))?) \.\.\. (ok|FAIL|ERROR|skipped (?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|.*?)|expected failure|unexpected success)(?= |$)/g;
  const skipped = [];
  // Tests with a docstring print "test_x (mod.Class)" on its own line, then "<docstring line> ... ok".
  const idOnly = /^(\S+ \([\w.]+\))$/;
  const docStatusRe = /\.\.\. (ok|FAIL|ERROR|skipped (?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|.*?)|expected failure|unexpected success)$/;
  let pendingId = null;
  for (const l of lines) {
    let m;
    statusRe.lastIndex = 0;
    let found = false;
    const recs = [];
    while ((m = statusRe.exec(l))) { found = true; recs.push([m[1], m[2]]); }
    if (!found && pendingId && (m = l.match(docStatusRe))) recs.push([pendingId, m[1]]);
    pendingId = idOnly.test(l) ? l : (found || recs.length ? null : pendingId && !l.trim() ? pendingId : null);
    for (const [id, status] of recs) {
      const { test } = parseTestId(id);
      let st = status;
      if (st.startsWith('skipped')) {
        skipped.push({ test, reason: st.slice(8).replace(/^['"]|['"]$/g, '') });
        st = 'skipped';
      }
      statuses[test] = st;
    }
  }

  // problem blocks
  const problems = [];
  const sep = '='.repeat(70);
  const dash = '-'.repeat(70);
  let totalProblems = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== sep) continue;
    const hdr = lines[i + 1] || '';
    const hm = hdr.match(/^(FAIL|ERROR|UNEXPECTED SUCCESS): (.*)$/);
    if (!hm || lines[i + 2] !== dash) continue;
    let j = i + 3;
    const body = [];
    while (j < lines.length && lines[j] !== sep && lines[j] !== dash) { body.push(lines[j]); j++; }
    totalProblems++;
    if (problems.length < maxProblems) {
      const { test, subtest } = parseTestId(hm[2].trim());
      const { text, location } = trimTraceback(body, projectDir, maxTb);
      problems.push({ kind: hm[1], test, subtest, location, traceback: text });
    }
    i = j - 1;
  }

  // summary
  let ran = null;
  const ranIdx = lines.findIndex((l) => /^Ran \d+ tests? in /.test(l));
  if (ranIdx >= 0) ran = parseInt(lines[ranIdx].match(/^Ran (\d+)/)[1], 10);
  let summaryLine = null;
  const counts = { passed: null, failures: 0, errors: 0, skipped: 0, expectedFailures: 0, unexpectedSuccesses: 0 };
  if (ranIdx >= 0) {
    for (let j = ranIdx + 1; j < Math.min(lines.length, ranIdx + 6); j++) {
      if (/^(OK|FAILED)\b/.test(lines[j])) { summaryLine = lines[j].trim(); break; }
    }
    if (summaryLine) {
      const grab = (re) => { const m = summaryLine.match(re); return m ? parseInt(m[1], 10) : 0; };
      counts.failures = grab(/(?<!expected )failures=(\d+)/);
      counts.errors = grab(/errors=(\d+)/);
      counts.skipped = grab(/skipped=(\d+)/);
      counts.expectedFailures = grab(/expected failures=(\d+)/);
      counts.unexpectedSuccesses = grab(/unexpected successes=(\d+)/);
      // tests with failing subTests print no status of their own, so count the explicit 'ok' lines
      const okCount = Object.values(statuses).filter((s) => s === 'ok').length;
      const failingTests = new Set();
      for (let i = 0; i < lines.length; i++) {
        const hm = lines[i] === sep && (lines[i + 1] || '').match(/^(?:FAIL|ERROR|UNEXPECTED SUCCESS): (.*)$/);
        if (hm) failingTests.add(parseTestId(hm[1].trim()).test);
      }
      counts.passed = Object.keys(statuses).length ? okCount : Math.max(0, ran - counts.skipped - counts.expectedFailures - failingTests.size);
      counts.failingTests = failingTests.size;
    }
  }

  // noise: lines that are not runner output (prints from tests), after the summary or interleaved
  const known = /^(Creating test database|Cloning test database|Destroying test database|Testing against Django|Importing application|Skipping setup of unused|Found \d+ test|System check identified|Operations to perform|  Synchroni[sz]e|  Apply all migrations|Synchronizing apps|  Creating tables|    Creating table|    Running deferred SQL|Running migrations|  Applying |Ran \d+ test|OK\b|FAILED \(|-{70}|={70})/;
  const result = {
    ok: !timedOut && code === 0 && summaryLine !== null && summaryLine.startsWith('OK'),
    command: `cd tests && python ${args.slice(1).join(' ')}`,
    ran,
    counts,
    summaryLine,
    durationSec,
    exitCode: code,
  };
  if (timedOut) result.timedOut = `killed after ${timeoutSec}s; use narrower labels or k`;
  if (problems.length) result.problems = problems;
  if (totalProblems > problems.length) result.problemsOmitted = totalProblems - problems.length;
  if (input.listSkipped) result.skipped = skipped;
  if (input.listStatuses) result.statuses = statuses;
  if (ranIdx < 0) {
    // aborted: return meaningful tail
    const tail = lines.filter((l) => !known.test(l)).join('\n').trim().split('\n');
    const tbIdx = tail.findIndex((l) => l.startsWith('Traceback (most recent call last)'));
    if (tbIdx >= 0) {
      const before = tail.slice(Math.max(0, tbIdx - 10), tbIdx).join('\n');
      result.crash = (before ? before + '\n' : '') + 'Traceback (trimmed):\n' + trimTraceback(tail.slice(tbIdx), projectDir, 40).text;
    } else {
      result.crash = tail.slice(-60).join('\n');
    }
  } else {
    const after = lines.slice(ranIdx + 1).filter((l) => l.trim() && !known.test(l));
    if (after.length) result.stdoutNoise = after.slice(0, 20).join('\n') + (after.length > 20 ? `\n... (${after.length - 20} more lines)` : '');
  }
  return result;
}
// trod: promoted 2026-11-07T06:38:46.420Z
