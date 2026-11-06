import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function run(input, ctx) {
  let pw;
  try { pw = createRequire(import.meta.url)('playwright'); }
  catch (e) {
    const { execSync } = await import('node:child_process');
    const root = execSync('npm root -g').toString().trim();
    pw = createRequire(root + '/')('playwright');
  }
  const browser = await pw.chromium.launch();
  const out = {};
  try {
    const page = await browser.newPage();
    for (let n = input.from ?? 1; n <= (input.to ?? 15); n++) {
      const p = `/products/${n}.html`;
      await page.goto(input.base.replace(/\/$/, '') + p);
      await page.waitForFunction(() => {
        const n = document.getElementById('name'), pr = document.getElementById('price');
        return n && pr && !/^Loading|^\s*$/.test(n.textContent) && /\d/.test(pr.textContent);
      }, null, { timeout: 15000 });
      await page.waitForTimeout(300);
      out[p] = await page.evaluate(() => ({
        name: document.getElementById('name').textContent.trim(),
        price: document.getElementById('price').textContent.trim(),
        inStock: !document.getElementById('buy').disabled,
      }));
    }
  } finally { await browser.close(); }
  writeFileSync(path.resolve(ctx.projectDir, input.output ?? 'products.json'), JSON.stringify(out, null, 2));
  return out;
}
