import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function run(input, ctx) {
  const require = createRequire(path.join(ctx.projectDir, 'x.js'));
  let pw;
  try { pw = require('playwright'); } catch { pw = createRequire('/usr/lib/node_modules/x.js')('playwright'); }
  const browser = await pw.chromium.launch();
  const out = {};
  const errors = [];
  try {
    const page = await browser.newPage();
    for (let i = input.from ?? 1; i <= (input.to ?? 15); i++) {
      const p = `/products/${i}.html`;
      try {
        await page.goto(input.base.replace(/\/$/, '') + p);
        await page.waitForFunction(() => {
          const n = document.getElementById('name'), pr = document.getElementById('price');
          return n && pr && /\S/.test(n.textContent) && !/^Loading|^\s*[.…]+\s*$/.test(n.textContent.trim())
            && /\d/.test(pr.textContent);
        }, null, { timeout: 15000 });
        out[p] = {
          name: (await page.textContent('#name')).trim(),
          price: (await page.textContent('#price')).trim(),
          inStock: !(await page.isDisabled('#buy')),
        };
      } catch (e) { errors.push(`${p}: ${e.message.split('\n')[0]}`); }
    }
  } finally { await browser.close(); }
  writeFileSync(path.join(ctx.projectDir, input.output ?? 'products.json'), JSON.stringify(out, null, 2));
  return { written: Object.keys(out).length, errors, data: out };
}
