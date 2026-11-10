import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { linkNotes, notesLinked, trodPaths } from '@trod/server';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.ts';
import { inHoldout, matchPages, notesHook, readNotesLog, readWikiPages, sessionDelivery } from '../src/delivery.ts';
import { buildHoldoutReport, formatReport, type SessionMetrics } from '../src/report.ts';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'trod-delivery-'));

/** A project in hooks delivery with notes and two wiki pages. */
function project(holdout = 0.1) {
  const dir = tmp();
  mkdirSync(path.join(dir, '.trod', 'wiki'), { recursive: true });
  writeFileSync(path.join(dir, '.trod', 'config.json'), JSON.stringify({ delivery: 'hooks', holdout }));
  writeFileSync(path.join(dir, '.trod', 'notes.md'), '# Notes\n- Use pnpm, never npm.\n');
  writeFileSync(path.join(dir, '.trod', 'wiki', 'billing.md'), '---\nwhen: invoice, billing run\n---\n# Billing\n- Amounts are in cents.\n');
  writeFileSync(path.join(dir, '.trod', 'wiki', 'deploy.md'), '# Deploy\n- No front matter: only reachable through the index.\n');
  return trodPaths(dir);
}

/** A session id that lands on the wanted side of the holdout. */
function sessionOn(side: boolean, share: number): string {
  for (let i = 0; ; i++) if (inHoldout(`s${i}`, share) === side) return `s${i}`;
}

describe('the holdout', () => {
  it('is stable per session and close to the share', () => {
    expect(inHoldout('abc', 0.1)).toBe(inHoldout('abc', 0.1));
    const n = Array.from({ length: 4000 }, (_, i) => inHoldout(`session-${i}`, 0.1)).filter(Boolean).length;
    expect(n / 4000).toBeGreaterThan(0.08);
    expect(n / 4000).toBeLessThan(0.12);
    expect(inHoldout('abc', 0)).toBe(false);
  });
});

describe('wiki pages for prompts', () => {
  it('reads when: keywords from front matter and matches them at word boundaries', () => {
    const pages = readWikiPages(project());
    expect(pages.map((p) => [p.name, p.when])).toEqual([['billing', ['invoice', 'billing run']], ['deploy', []]]);
    expect(pages[0].body.startsWith('# Billing')).toBe(true);
    expect(matchPages(pages, 'Fix the Invoice totals').map((h) => h.page.name)).toEqual(['billing']);
    expect(matchPages(pages, 'the invoices page')).toEqual([]); // "invoice" inside "invoices" is not the word
    expect(matchPages(pages, 'start the billing run now').map((h) => h.keyword)).toEqual(['billing run']);
  });
});

describe('notes delivered by hooks', () => {
  it('does nothing unless the project chose hooks delivery', () => {
    const dir = tmp();
    mkdirSync(path.join(dir, '.trod'));
    writeFileSync(path.join(dir, '.trod', 'notes.md'), '# Notes\n');
    expect(notesHook(trodPaths(dir), { hook_event_name: 'SessionStart', session_id: 'a' })).toBeUndefined();
  });

  it('injects the notes at session start and matching pages once per session, and logs it all', () => {
    const paths = project();
    const s = sessionOn(false, 0.1);
    const t0 = new Date('2026-11-09T10:00:00Z');
    expect(notesHook(paths, { hook_event_name: 'SessionStart', session_id: s }, t0)).toContain('- Use pnpm, never npm.');
    // The plugin's hook and the project's can both fire: the second within seconds adds nothing.
    expect(notesHook(paths, { hook_event_name: 'SessionStart', session_id: s }, new Date(t0.getTime() + 2000))).toBeUndefined();
    const page = notesHook(paths, { hook_event_name: 'UserPromptSubmit', session_id: s, prompt: 'Why is the invoice wrong?' }, t0);
    expect(page).toContain('- Amounts are in cents.');
    expect(page).not.toContain('when:');
    expect(notesHook(paths, { hook_event_name: 'UserPromptSubmit', session_id: s, prompt: 'And the next invoice?' }, t0)).toBeUndefined();
    expect(notesHook(paths, { hook_event_name: 'UserPromptSubmit', session_id: s, prompt: 'deploy it' }, t0)).toBeUndefined();
    // A resumed or compacted session gets the notes again (its context lost them), and its pages once more.
    expect(notesHook(paths, { hook_event_name: 'SessionStart', session_id: s, source: 'compact' }, new Date(t0.getTime() + 60_000))).toContain('Use pnpm');
    expect(readNotesLog(paths).map((e) => e.type)).toEqual(['session', 'page']);
    expect(sessionDelivery(paths).get(s)).toEqual({ holdout: false, notes: true, pages: ['billing'] });
    // The new context lost the page too: a matching prompt brings it back.
    expect(notesHook(paths, { hook_event_name: 'UserPromptSubmit', session_id: s, prompt: 'invoice' }, new Date(t0.getTime() + 61_000))).toContain('- Amounts are in cents.');
    // A compaction seconds after the start is a new context, not a duplicate hook.
    expect(notesHook(paths, { hook_event_name: 'SessionStart', session_id: s, source: 'clear' }, new Date(t0.getTime() + 62_000))).toContain('Use pnpm');
    // The per-session state stays out of git.
    expect(readFileSync(path.join(paths.trodDir, 'state', '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('gives the holdout nothing, and logs that it was the holdout', () => {
    const paths = project(0.5);
    const s = sessionOn(true, 0.5);
    expect(notesHook(paths, { hook_event_name: 'SessionStart', session_id: s })).toBeUndefined();
    expect(notesHook(paths, { hook_event_name: 'UserPromptSubmit', session_id: s, prompt: 'invoice' })).toBeUndefined();
    expect(sessionDelivery(paths).get(s)).toEqual({ holdout: true, notes: false, pages: [] });
  });

  it('decides on the first prompt when SessionStart did not run', () => {
    const paths = project();
    const s = sessionOn(false, 0.1);
    const first = notesHook(paths, { hook_event_name: 'UserPromptSubmit', session_id: s, prompt: 'billing run please' });
    // No SessionStart: the first prompt carries the notes as well as the page.
    expect(first).toContain('- Use pnpm, never npm.');
    expect(first).toContain('cents');
    expect(sessionDelivery(paths).get(s)).toEqual({ holdout: false, notes: true, pages: ['billing'] });
    expect(notesHook(paths, { hook_event_name: 'UserPromptSubmit', session_id: s, prompt: 'next one' })).toBeUndefined();
  });

  it('delivers the notes even when the log cannot be written', () => {
    const paths = project();
    mkdirSync(paths.trodDir, { recursive: true });
    writeFileSync(paths.logsDir, 'not a directory');
    const s = sessionOn(false, 0.1);
    expect(notesHook(paths, { hook_event_name: 'SessionStart', session_id: s })).toContain('Use pnpm');
  });
});

describe('trod notes --delivery', () => {
  it('switches to hooks: config, no CLAUDE.md import, hooks installed; linking stays a no-op', async () => {
    const dir = tmp();
    mkdirSync(path.join(dir, '.trod'));
    writeFileSync(path.join(dir, '.trod', 'notes.md'), '# Notes\n- a rule\n');
    writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project\n\nUse tabs.\n\n  @.trod/notes.md  \n');
    linkNotes(trodPaths(dir));
    expect(readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toContain('@.trod/notes.md');
    const lines: string[] = [];
    expect(await main(['notes', '--dir', dir, '--delivery', 'hooks', '--holdout', '0.2'], (s) => lines.push(s))).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, '.trod', 'config.json'), 'utf8'))).toEqual({ delivery: 'hooks', holdout: 0.2 });
    const claude = readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    expect(claude).not.toContain('@.trod/notes.md');
    expect(claude).not.toContain('Project notes (trod)');
    expect(claude).toContain('Use tabs.');
    const hooks = JSON.parse(readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8')).hooks;
    expect(Object.keys(hooks).sort()).toEqual(['PostToolUse', 'SessionEnd', 'SessionStart', 'UserPromptSubmit']);
    expect(hooks.SessionStart[0].hooks[0].command).toMatch(/^npx -y trod(@\S+)? hook$/);
    // forge and learn link notes: with hooks delivery that adds no import, and the notes count as delivered.
    expect(linkNotes(trodPaths(dir))).toBe(false);
    expect(notesLinked(trodPaths(dir))).toBe(true);
    expect(readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).not.toContain('@.trod/notes.md');
    // And back.
    expect(await main(['notes', '--dir', dir, '--delivery', 'import'], (s) => lines.push(s))).toBe(0);
    expect(readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toContain('@.trod/notes.md');
    expect(await main(['notes', '--dir', dir, '--delivery', 'hooks', '--holdout', '0.9'], (s) => lines.push(s))).toBe(1);
  });

  it('refuses to deliver notes whose checks fail, and moves a pinned older hook to this version', async () => {
    const dir = tmp();
    mkdirSync(path.join(dir, '.trod'));
    writeFileSync(path.join(dir, '.trod', 'notes.md'), '# Notes\n- a rule\n');
    writeFileSync(path.join(dir, '.trod', 'notes.checks.json'), JSON.stringify([{ claim: 'false', run: 'node -e "process.exit(1)"' }]));
    const lines: string[] = [];
    expect(await main(['notes', '--dir', dir, '--delivery', 'hooks'], (s) => lines.push(s))).toBe(1);
    expect(existsSync(path.join(dir, '.trod', 'config.json'))).toBe(false);
    // The way out: with failing checks, --delivery import still turns hooks delivery off, and links nothing.
    writeFileSync(path.join(dir, '.trod', 'config.json'), JSON.stringify({ delivery: 'hooks', holdout: 0.1 }));
    writeFileSync(path.join(dir, 'CLAUDE.md'), '# P\n\n@.trod/notes.md\n'); // a leftover import would still load them
    expect(await main(['notes', '--dir', dir, '--delivery', 'import'], (s) => lines.push(s))).toBe(1);
    expect(JSON.parse(readFileSync(path.join(dir, '.trod', 'config.json'), 'utf8'))).toEqual({ holdout: 0.1 });
    expect(readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).not.toContain('@.trod/notes.md');
    rmSync(path.join(dir, 'CLAUDE.md'));
    rmSync(path.join(dir, '.trod', 'notes.checks.json'));
    mkdirSync(path.join(dir, '.claude'));
    writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'npx -y trod@0.0.1 hook' }, { type: 'prompt' }] }] } }));
    expect(await main(['notes', '--dir', dir, '--delivery', 'hooks'], (s) => lines.push(s))).toBe(0);
    const hooks = JSON.parse(readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8')).hooks;
    expect(hooks.SessionStart[0].hooks[0].command).not.toContain('trod@0.0.1');
    // A hook without a command is someone else's: kept.
    expect(hooks.PostToolUse[0].hooks).toEqual([{ type: 'prompt' }]);
  });

  it('trod init installs all three hooks (they do nothing until hooks delivery is chosen)', async () => {
    const dir = tmp();
    expect(await main(['init', '--dir', dir], () => {})).toBe(0);
    const hooks = JSON.parse(readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8')).hooks;
    expect(Object.keys(hooks).sort()).toEqual(['PostToolUse', 'SessionEnd', 'SessionStart', 'UserPromptSubmit']);
    expect(existsSync(path.join(dir, '.trod', 'config.json'))).toBe(false);
  });
});

describe('trod report with a holdout', () => {
  const m = (id: string, toolErrors: number): SessionMetrics => ({ id, client: 'claude', start: '2026-11-09T10:00:00Z', turns: 10, toolCalls: 10, toolErrors, followUps: 0, outputTokens: 100, inputTokens: 1000, trodRun: false });
  it('compares holdout sessions with the rest and says the split is random', () => {
    const delivery = new Map([['h1', { holdout: true }], ['t1', { holdout: false }], ['t2', { holdout: false }]]);
    const r = buildHoldoutReport([m('h1', 4), m('t1', 1), m('t2', 1), m('unseen', 9)], delivery);
    expect(r).toMatchObject({ mode: 'holdout', before: { sessions: 1, errorRate: 0.4 }, after: { sessions: 2, errorRate: 0.1 }, ungrouped: 1 });
    const text = formatReport(r);
    expect(text).toMatch(/no notes\s+with notes/);
    expect(text).toContain('Randomized');
    // A session outside the holdout that got no notes (none existed yet) is in neither group.
    expect(buildHoldoutReport([m('t3', 1)], new Map([['t3', { holdout: false, notes: false }]]))).toMatchObject({ ungrouped: 1, after: { sessions: 0 } });
  });

  it('trod report picks the holdout comparison from the hook log and the transcripts', async () => {
    const paths = project(0.5);
    const h = sessionOn(true, 0.5);
    const t = sessionOn(false, 0.5);
    notesHook(paths, { hook_event_name: 'SessionStart', session_id: h });
    notesHook(paths, { hook_event_name: 'SessionStart', session_id: t });
    const from = path.join(paths.projectDir, 'transcripts');
    mkdirSync(from);
    const transcript = (id: string, file: string) =>
      writeFileSync(
        path.join(from, file),
        [
          { type: 'user', sessionId: id, timestamp: '2026-11-09T10:00:00Z', message: { role: 'user', content: 'fix the invoice' } },
          { type: 'assistant', sessionId: id, timestamp: '2026-11-09T10:00:05Z', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }], usage: { output_tokens: 10, input_tokens: 100 } } },
        ]
          .map((e) => JSON.stringify(e))
          .join('\n') + '\n',
      );
    transcript(h, `${h}.jsonl`);
    transcript(t, 'renamed-copy.jsonl'); // the id comes from the events, not the file name
    const lines: string[] = [];
    expect(await main(['report', '--dir', paths.projectDir, '--from', from, '--json'], (s) => lines.push(s))).toBe(0);
    expect(JSON.parse(lines.join('\n'))).toMatchObject({ mode: 'holdout', before: { sessions: 1 }, after: { sessions: 1 }, ungrouped: 0 });
  });
});
