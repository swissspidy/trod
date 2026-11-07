import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { _codeQa } from '../tasks/code-qa.ts';
import { TASKS } from '../tasks/index.ts';

const work = () => mkdtempSync(path.join(tmpdir(), 'trod-task-'));
const put = (w: string, rel: string, content: string) => {
  mkdirSync(path.dirname(path.join(w, rel)), { recursive: true });
  writeFileSync(path.join(w, rel), content);
};

/** Writes the known-correct outcome for step `i`, to prove the checkers accept it. */
const ORACLES: Record<string, (w: string, expected: any, i: number) => void> = {
  'page-audit': (w, e, i) => put(w, ['audit.json', 'audit-2.json', 'audit-3.json'][i]!, JSON.stringify(e[i])),
  'api-query': (w, e, i) => put(w, ['totals.json', 'refunds.json', 'pending.json'][i]!, JSON.stringify(e[i])),
  'browser-check': (w, e, i) => put(w, ['products.json', 'products-2.json', 'products-3.json'][i]!, JSON.stringify(e[i])),
  'log-analysis': (w, e, i) => put(w, ['report.json', 'report-2.json', 'report-3.json'][i]!, JSON.stringify(e[i])),
  'md-links': (w, e, i) => put(w, ['broken.json', 'broken-2.json', 'broken-3.json'][i]!, JSON.stringify(e[i])),
  'config-migrate': (w, e, i) => {
    const dir = ['configs', 'configs-staging', 'configs-prod'][i]!;
    for (const [f, v] of Object.entries(e[i])) put(w, `${dir}/${f}`, JSON.stringify(v));
  },
  'csv-clean': (w, _e, i) => {
    // Reference cleaner, written independently of the generator.
    const dir = ['data/raw', 'data/raw-2', 'data/raw-3'][i]!;
    const months: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    for (const f of readdirSync(path.join(w, dir))) {
      const rows = new Map<number, string>();
      const lines = readFileSync(path.join(w, dir, f), 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
      for (const line of lines) {
        const cells = line.match(/("[^"]*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, ''));
        const [id, date, name, amountRaw] = cells as [string, string, string, string];
        const amount = Number(amountRaw.replace(/[$,\s]/g, ''));
        if (!amountRaw.trim() || Number.isNaN(amount)) continue;
        let iso = date;
        let m;
        if ((m = date.match(/^(\d\d)\/(\d\d)\/(\d{4})$/))) iso = `${m[3]}-${m[2]}-${m[1]}`;
        else if ((m = date.match(/^(\w{3}) (\d+) (\d{4})$/))) iso = `${m[3]}-${months[m[1]!]}-${m[2]!.padStart(2, '0')}`;
        const customer = name.trim().split(/\s+/).map((x) => x[0]!.toUpperCase() + x.slice(1).toLowerCase()).join(' ');
        if (!rows.has(Number(id))) rows.set(Number(id), `${id},${iso},${customer},${amount.toFixed(2)}`);
      }
      const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
      put(w, `data/clean/${f}`, ['id,date,customer,amount', ...sorted].join('\n') + '\n');
    }
  },
  'bulk-refactor': (w, _e, i) => {
    const dir = path.join(w, ['src/modules', 'src/legacy', 'src/plugins'][i]!);
    for (const f of readdirSync(dir)) {
      const src = readFileSync(path.join(dir, f), 'utf8')
        .replace(/import \{ log(, formatId)? \}/, (_m, fmt) => `import { logger${fmt ? ', formatID' : ''} }`)
        .replace(/\blog\(\s*(['"`])(\w+)\1,\s*/g, 'logger.$2(')
        .replace(/formatId/g, 'formatID');
      writeFileSync(path.join(dir, f), src);
    }
  },
  'control-bugfix': (w) =>
    put(w, 'src/stats.mjs', 'export function median(v) { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }\n'),
  'control-question': (w, e) => put(w, 'answer.txt', e + '\n'),
  'inventory-api': (w, e, i) => put(w, ['stock-value.json', 'reorder.json', 'movements.json', 'price-changes.json'][i]!, JSON.stringify(e[i])),
  'ticket-triage': (w, e, i) => put(w, `triage-${i + 1}.json`, JSON.stringify(e[i])),
  'code-qa': (w, _e, i) => {
    const { g, steps } = _codeQa.data();
    const answers: Record<string, unknown> = {};
    for (const q of steps[i]!) {
      if (q.kind === 'path') {
        // BFS for one shortest chain.
        const prev = new Map<string, string>([[q.from, '']]);
        const queue = [q.from];
        while (queue.length) {
          const x = queue.shift()!;
          for (const c of g.byId.get(x)!.calls) {
            if (prev.has(c)) continue;
            prev.set(c, x);
            queue.push(c);
          }
        }
        const chain = [q.to];
        while (chain[0] !== q.from) chain.unshift(prev.get(chain[0]!)!);
        answers[q.id] = chain;
      } else answers[q.id] = q.answer;
    }
    put(w, `answers-${i + 1}.json`, JSON.stringify(answers));
  },
};

describe.each(TASKS.map((t) => [t.id, t] as const))('task %s', (_id, task) => {
  it('is deterministic, fails on an empty run and passes every step with the oracle', () => {
    const w = work();
    const expected = task.setup({ work: w });
    expect(JSON.stringify(task.setup({ work: work() }))).toBe(JSON.stringify(expected));
    expect(task.kind === 'control' ? task.steps.length : task.steps.length).toBeGreaterThanOrEqual(task.kind === 'control' ? 1 : 3);
    task.steps.forEach((step, i) => {
      if (i > 0) task.prepareStep?.({ work: w }, i);
      expect(step.check({ work: w }, expected).pass).toBe(false);
      ORACLES[task.id]!(w, expected, i);
      const res = step.check({ work: w }, expected);
      expect(res.details, `step ${i}`).toBeTruthy();
      expect(res.pass, `step ${i}: ${res.details}`).toBe(true);
      expect(step.prompt({ work: w, baseUrl: 'http://127.0.0.1:1' })).toContain('DONE');
    });
  });

  it.runIf(!!task.handler)('serves its fixture', async () => {
    const expected = task.setup({ work: work() });
    const state = { step: 0 };
    const server = createServer(task.handler!(expected, state));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/index.html`);
    expect([200, 401, 404, 429]).toContain(res.status);
    server.close();
  });
});
