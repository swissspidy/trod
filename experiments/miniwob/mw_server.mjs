/**
 * One MiniWoB++ episode behind HTTP (MiniWoB++: https://github.com/Farama-Foundation/miniwob-plusplus, MIT).
 *
 *   node mw_server.mjs <task> <seed> <port>      (MW_SCORE_TOKEN in the environment)
 *
 * Loads the task page in headless Chromium, seeds it and starts one episode with a long timer (agents think slowly;
 * the raw reward, not the time-scaled one, is scored). The agent only reaches the page through POST /act, a few
 * plain actions per line (see HELP); it never sees the reward. POST /score with the token returns it.
 */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [task, seed, port] = process.argv.slice(2);
const HTML = path.join(process.env.MW_HOME ?? '/opt/miniwob', 'html', 'miniwob');
const TOKEN = process.env.MW_SCORE_TOKEN ?? '';
const MAX_ACTIONS = Number(process.env.MW_MAX_ACTIONS ?? 60);

const HELP = `Actions (one per line; element ids come from the latest observation):
  observe                 list the task's elements again
  click <id>              click an element
  dblclick <id>           double-click an element
  hover <id>              move the mouse over an element
  type <id> <text>        click an input, clear it and type text (keystrokes, so autocompletes react)
  press <key>             press a key, e.g. Enter, Tab, ArrowDown, Control+A
  select <id> <option>    choose an option of a <select> by its label
  clickxy <x> <y>         click at page coordinates
  drag <id> <id>          drag one element onto another
  dragxy <x1> <y1> <x2> <y2>  drag between page coordinates
  scroll <id> <dy>        scroll an element by dy pixels
  screenshot <file.png>   save a picture of the task area (Read it to look)`;

// The repository pins its own Playwright; MW_CHROMIUM (default: the machine's pre-installed Chromium) avoids a version mismatch.
const exe = process.env.MW_CHROMIUM ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(exe) ? { executablePath: exe, args: ['--headless=new', '--no-sandbox'] } : {});
const page = await browser.newPage({ viewport: { width: 500, height: 420 } });
await page.goto(`file://${HTML}/${task}.html`);
await page.evaluate((s) => {
  Math.seedrandom(s);
  core.EPISODE_MAX_TIME = 24 * 3600 * 1000;
  core.startEpisodeReal();
}, seed);
// The reward display is the agent's feedback channel in the original UI: hide it so the score stays with the runner.
await page.addStyleTag({ content: '#reward-display, #timer-countdown, #episode-id, .info { display: none !important; }' });
let actions = 0;

async function observe() {
  return page.evaluate(() => {
    const q = document.getElementById('query')?.innerText.trim() ?? '';
    // Widgets such as autocomplete menus and date pickers attach to <body>, outside the task area: list the whole page.
    const area = document.body;
    const query = document.getElementById('query');
    let next = Number(document.body.dataset.mwNext ?? 1);
    const lines = [];
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    const interactive = (el) => ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'OPTION'].includes(el.tagName) || el.onclick || el.getAttribute('tabindex') !== null || el.getAttribute('role') || el.isContentEditable || el instanceof SVGElement;
    for (const el of area.querySelectorAll('*')) {
      if (!vis(el) && el.tagName !== 'OPTION') continue;
      if (query && (el === query || query.contains(el))) continue;
      if (el.closest('#reward-display, #sync-task-cover, #click-canvas')) continue;
      const text = ownText(el);
      if (!text && !interactive(el)) continue;
      if (['svg', 'g', 'defs'].includes(el.tagName)) continue;
      if (!el.dataset.mw) el.dataset.mw = String(next++);
      const r = el.getBoundingClientRect();
      const bits = [`[${el.dataset.mw}]`, el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')];
      if (text) bits.push(JSON.stringify(text.slice(0, 120)));
      for (const a of ['type', 'name', 'placeholder', 'title', 'aria-label', 'fill', 'data-type', 'data-color', 'href']) {
        const v = el.getAttribute(a);
        if (v) bits.push(`${a}=${JSON.stringify(v.slice(0, 60))}`);
      }
      if ('value' in el && el.value !== undefined && el.value !== '' && el.tagName !== 'BUTTON' && el.tagName !== 'LI') bits.push(`value=${JSON.stringify(String(el.value).slice(0, 80))}`);
      if (el.checked) bits.push('checked');
      if (el.disabled) bits.push('disabled');
      if (el.tagName === 'OPTION' && el.selected) bits.push('selected');
      bits.push(`@${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      lines.push(bits.join(' '));
    }
    document.body.dataset.mwNext = String(next);
    return `Task: ${q}\n${lines.join('\n')}`;
  });
}

const el = (id) => page.locator(`[data-mw="${String(id).replace(/[^0-9]/g, '')}"]`).first();

async function act(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  const arg = line.trim().slice(cmd.length).trim();
  switch (cmd) {
    case 'observe':
      return observe();
    case 'click':
      await el(rest[0]).click({ timeout: 3000, force: true });
      return `clicked ${rest[0]}`;
    case 'dblclick':
      await el(rest[0]).dblclick({ timeout: 3000, force: true });
      return `double-clicked ${rest[0]}`;
    case 'hover':
      await el(rest[0]).hover({ timeout: 3000, force: true });
      return `hovered ${rest[0]}`;
    case 'type': {
      const text = arg.slice(rest[0].length).trim();
      await el(rest[0]).click({ timeout: 3000, force: true });
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await page.keyboard.type(text, { delay: 20 });
      await page.waitForTimeout(600); // let autocompletes (jQuery UI waits 300 ms) render their menus
      return `typed into ${rest[0]}`;
    }
    case 'press':
      await page.keyboard.press(rest[0]);
      return `pressed ${rest[0]}`;
    case 'select':
      await el(rest[0]).selectOption({ label: arg.slice(rest[0].length).trim() }, { timeout: 3000 });
      return `selected in ${rest[0]}`;
    case 'clickxy':
      await page.mouse.click(Number(rest[0]), Number(rest[1]));
      return `clicked at ${rest[0]},${rest[1]}`;
    case 'drag': {
      await el(rest[0]).dragTo(el(rest[1]), { timeout: 3000, force: true });
      return `dragged ${rest[0]} to ${rest[1]}`;
    }
    case 'dragxy': {
      const [x1, y1, x2, y2] = rest.map(Number);
      await page.mouse.move(x1, y1);
      await page.mouse.down();
      await page.mouse.move(x2, y2, { steps: 12 });
      await page.mouse.up();
      return `dragged ${x1},${y1} to ${x2},${y2}`;
    }
    case 'scroll':
      await el(rest[0]).evaluate((e, dy) => e.scrollBy(0, dy), Number(rest[1]));
      return `scrolled ${rest[0]}`;
    case 'screenshot': {
      const file = rest[0];
      if (!file?.endsWith('.png')) throw new Error('screenshot needs a .png path');
      const buf = await page.screenshot();
      return { screenshot: file, png: buf.toString('base64') };
    }
    default:
      throw new Error(`unknown action "${cmd}"\n${HELP}`);
  }
}

const body = (req) => new Promise((resolve) => {
  let s = '';
  req.on('data', (c) => (s += c));
  req.on('end', () => resolve(s));
});

let queue = Promise.resolve();
createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  try {
    if (req.method === 'GET' && req.url === '/task') return send(200, { task, utterance: await page.evaluate(() => document.getElementById('query')?.innerText.trim() ?? ''), help: HELP, observation: await observe() });
    if (req.method === 'POST' && req.url === '/score') {
      if (!TOKEN || req.headers['x-score-token'] !== TOKEN) return send(403, { error: 'forbidden' });
      return send(200, await page.evaluate(() => ({ reward: WOB_RAW_REWARD_GLOBAL, done: WOB_DONE_GLOBAL, reason: WOB_REWARD_REASON })));
    }
    if (req.method === 'POST' && req.url === '/act') {
      const text = await body(req);
      const run = queue.then(async () => {
        const out = [];
        const files = [];
        for (const line of text.split('\n').filter((l) => l.trim())) {
          if (await page.evaluate(() => WOB_DONE_GLOBAL)) {
            out.push('The episode has ended; nothing more can be done.');
            break;
          }
          if (++actions > MAX_ACTIONS) {
            out.push(`Action limit (${MAX_ACTIONS}) reached.`);
            break;
          }
          try {
            const r = await act(line);
            if (typeof r === 'string') out.push(r);
            else files.push(r), out.push(`screenshot saved to ${r.screenshot}`);
          } catch (e) {
            out.push(`error in "${line.trim()}": ${e.message.split('\n')[0]}`);
          }
          await page.waitForTimeout(150);
        }
        const done = await page.evaluate(() => WOB_DONE_GLOBAL);
        if (done) out.push('The episode has ended.');
        else if (!/^observe$/.test(text.trim().split('\n').at(-1) ?? '')) out.push(await observe());
        return { output: out.join('\n'), files, done, actions };
      });
      queue = run.catch(() => {});
      return send(200, await run);
    }
    send(404, { error: 'not found' });
  } catch (e) {
    send(500, { error: e.message });
  }
}).listen(Number(port), '127.0.0.1', () => console.log(`ready ${port}`));
