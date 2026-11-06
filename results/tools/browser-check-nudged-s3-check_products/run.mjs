import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

export default async function run(input) {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const n = input.count ?? 15;
  const browser = await chromium.launch();
  const out = {};
  const errors = [];
  try {
    for (let i = 1; i <= n; i++) {
      const p = `/products/${i}.html`;
      const page = await browser.newPage();
      try {
        await page.goto(input.baseUrl.replace(/\/$/, '') + p);
        await page.waitForFunction(() => {
          const a = document.getElementById('name'), b = document.getElementById('price');
          return a && b && /^\$\d/.test(b.textContent.trim()) && !/^loading/i.test(a.textContent.trim());
        }, null, { timeout: 15000 });
        await page.waitForTimeout(500);
        out[p] = await page.evaluate(() => ({
          name: document.getElementById('name').textContent.trim(),
          price: document.getElementById('price').textContent.trim(),
          inStock: !document.getElementById('buy').disabled,
        }));
      } catch (e) {
        errors.push(`${p}: ${e.message.split('\n')[0]}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(input.outPath, JSON.stringify(out, null, 2));
  return { written: Object.keys(out).length, errors, sample: out['/products/1.html'] };
}
