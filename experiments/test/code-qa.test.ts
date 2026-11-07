import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import task, { _codeQa } from '../tasks/code-qa.ts';

/** Names in a result tree: every function returns { step: name, input, <callee results>… }. */
function stepNames(v: any, out = new Set<string>()): Set<string> {
  if (v && typeof v === 'object') {
    if (typeof v.step === 'string') out.add(v.step);
    for (const x of Object.values(v)) stepNames(x, out);
  }
  return out;
}

describe('code-qa fixture', () => {
  it('generated code really has the call graph the answers are computed from', async () => {
    const work = mkdtempSync(path.join(tmpdir(), 'trod-codeqa-'));
    task.setup({ work });
    const { g } = _codeQa.data();
    expect(g.all.length).toBeGreaterThan(200);
    for (const f of g.all) {
      const mod = await import(pathToFileURL(path.join(work, 'src', f.module)).href);
      const fn = f.isDefault ? mod.default : mod[f.name];
      expect(typeof fn, f.id).toBe('function');
      const got = stepNames(fn(1));
      const want = new Set([f.name, ...[..._codeQa.transitiveCallees(g, f.id)].map((id) => g.byId.get(id)!.name)]);
      expect([...got].sort(), f.id).toEqual([...want].sort());
    }
    // main.js loads.
    const main = await import(pathToFileURL(path.join(work, 'src', 'main.js')).href);
    expect(typeof main.main).toBe('function');
  });

  it('asks answerable questions', () => {
    const { steps } = _codeQa.data();
    for (const qs of steps) for (const q of qs) {
      if (q.kind === 'callers' || q.kind === 'unreachable') expect(q.answer.length).toBeGreaterThan(0);
      if (q.kind === 'path') expect(q.length).toBeGreaterThanOrEqual(3);
    }
  });
});
