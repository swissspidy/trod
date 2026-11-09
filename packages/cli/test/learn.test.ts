import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main } from '../src/cli.ts';
import { checkLedgerHistory, digestTranscript, findTranscripts, LEARN_PROMPT, readLedger, readOutcomes, summarizeLedger, transcriptDir, writeDigests } from '../src/learn.ts';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'trod-learn-'));

/** A Claude Code session transcript: the prompt, one tool call that fails, one that works, a final message. */
function transcript(dir: string, id: string, task: string): string {
  const file = path.join(dir, `${id}.jsonl`);
  const lines = [
    { type: 'queue-operation', operation: 'enqueue' },
    { type: 'user', message: { role: 'user', content: task } },
    { type: 'user', isMeta: true, message: { role: 'user', content: 'a reminder the digest skips' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'mw press Enter' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'Enter does not submit' }] } },
    { type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: 'a subagent the digest skips' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'mw click 7' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'clicked 7' }] }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Submitted. DONE' }] } },
  ];
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n{"torn":');
  return file;
}

describe('digestTranscript', () => {
  it('keeps the task, tool calls, errors and the final message, and skips meta and sidechain events', () => {
    const d = digestTranscript(transcript(tmp(), 's1', 'Fill the form and submit it.'), { outcome: 'pass' })!;
    expect(d).toMatchObject({ id: 's1', task: 'Fill the form and submit it.', outcome: 'pass', toolCalls: 2, errors: 1 });
    expect(d.text).toContain('# Session s1: PASS');
    expect(d.text).toContain('CALL Bash: mw press Enter');
    expect(d.text).toContain('ERROR: Enter does not submit');
    expect(d.text).toContain('RESULT: clicked 7');
    expect(d.text).toContain('ASSISTANT: Submitted. DONE');
    expect(d.text).not.toContain('reminder');
    expect(d.text).not.toContain('subagent');
  });

  it('shortens long sessions, keeping their start and end', () => {
    const dir = tmp();
    const file = path.join(dir, 'long.jsonl');
    const steps = Array.from({ length: 300 }, (_, i) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: `step ${i}` } }] } }));
    writeFileSync(file, [JSON.stringify({ type: 'user', message: { content: 'task' } }), ...steps].join('\n'));
    const d = digestTranscript(file, { maxChars: 3000 })!;
    expect(d.text.length).toBeLessThan(3600);
    expect(d.text).toContain('step 0');
    expect(d.text).toContain('step 299');
    expect(d.text).toContain('middle of the session omitted');
  });

  it('keeps tool results that share a message with text, and tasks written as XML, but drops command wrappers', () => {
    const file = path.join(tmp(), 'mixed.jsonl');
    const lines = [
      { type: 'user', message: { content: '<command-name>/clear</command-name>' } },
      { type: 'user', message: { content: '<task>Rename the module</task>' } },
      { type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'boom' }, { type: 'text', text: 'try again' }] } },
    ];
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
    const d = digestTranscript(file)!;
    expect(d.task).toBe('<task>Rename the module</task>');
    expect(d.errors).toBe(1);
    expect(d.text).toContain('ERROR: boom');
    expect(d.text).toContain('USER: try again');
    expect(d.text).not.toContain('/clear');
  });

  it('keeps the final message within the size budget', () => {
    const file = path.join(tmp(), 'final.jsonl');
    const steps = Array.from({ length: 200 }, (_, i) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: `step ${i} ${'x'.repeat(80)}` } }] } }));
    writeFileSync(file, [JSON.stringify({ type: 'user', message: { content: 'task' } }), ...steps, JSON.stringify({ type: 'result', result: 'F'.repeat(2000) })].join('\n'));
    const d = digestTranscript(file, { maxChars: 4000 })!;
    expect(d.text.length).toBeLessThanOrEqual(4000);
    expect(d.text).toContain('## Final message');
  });

  it('returns undefined for a transcript with no conversation', () => {
    const file = path.join(tmp(), 'empty.jsonl');
    writeFileSync(file, '{"type":"queue-operation"}\n');
    expect(digestTranscript(file)).toBeUndefined();
  });
});

describe('outcomes, digests and transcript locations', () => {
  it('reads outcomes as booleans, words or scores', () => {
    const file = path.join(tmp(), 'o.json');
    writeFileSync(file, JSON.stringify({ a: true, 'b.jsonl': false, c: 'pass', d: 0.5, e: 0, f: null }));
    expect(Object.fromEntries(readOutcomes(file))).toEqual({ a: 'pass', b: 'fail', c: 'pass', d: 'pass', e: 'fail', f: 'unknown' });
  });

  it('writes one file per session and an index', () => {
    const dir = tmp();
    const d1 = digestTranscript(transcript(dir, 'x', 'You are a helper.\nTask: Select Legra'), { outcome: 'fail' })!;
    const d2 = digestTranscript(transcript(dir, 'y', 'Task: Select Natala'))!;
    const out = path.join(dir, 'sessions');
    expect(writeDigests(out, [d1, d2])).toEqual({ pass: 0, fail: 1, unknown: 1 });
    expect(readdirSync(out).sort()).toEqual(['001-fail.md', '002-unknown.md', 'INDEX.md']);
    const index = readFileSync(path.join(out, 'INDEX.md'), 'utf8');
    expect(index).toContain('| 001-fail.md | fail | 2 | 1 | Task: Select Legra |');
  });

  it("finds Claude Code's transcripts for a project", () => {
    expect(transcriptDir('/home/u/my.repo', '/home/u/.claude')).toBe('/home/u/.claude/projects/-home-u-my-repo');
    expect(transcriptDir('/r', '/etc/claude-config')).toBe('/etc/claude-config/projects/-r');
    const dir = tmp();
    mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
    writeFileSync(path.join(dir, 'a', 'b', 's.jsonl'), '');
    writeFileSync(path.join(dir, 'a', 'notes.md'), '');
    expect(findTranscripts([dir, path.join(dir, 'missing')])).toEqual([path.join(dir, 'a', 'b', 's.jsonl')]);
  });

  it('lists each transcript once, newest first, even through overlapping sources and symlink cycles', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'old.jsonl'), '');
    writeFileSync(path.join(dir, 'new.jsonl'), '');
    utimesSync(path.join(dir, 'old.jsonl'), new Date(1000), new Date(1000));
    symlinkSync('.', path.join(dir, 'loop'), 'dir');
    expect(findTranscripts([dir, path.join(dir, 'new.jsonl')])).toEqual([path.join(dir, 'new.jsonl'), path.join(dir, 'old.jsonl')]);
  });

  it('tells the learner where the sessions are and to compare failures with successes', () => {
    const p = LEARN_PROMPT('/tmp/s', { pass: 3, fail: 2, unknown: 1 });
    expect(p).toContain('/tmp/s');
    expect(p).toContain('3 passed, 2 failed, 1 with unknown outcome');
    expect(p).toContain('.trod/wiki/');
  });
});

describe('trod learn', () => {
  const saved = process.env.TROD_CLAUDE_BIN;
  afterEach(() => {
    if (saved === undefined) delete process.env.TROD_CLAUDE_BIN;
    else process.env.TROD_CLAUDE_BIN = saved;
  });

  it('digests the sessions, runs the learner and links the notes it wrote', async () => {
    const dir = tmp();
    const sessions = path.join(dir, 'sessions');
    mkdirSync(sessions);
    transcript(sessions, 'good', 'Task: submit the form');
    transcript(sessions, 'bad', 'Task: submit the form');
    // An earlier forge session in the same transcript folder must not be learned from.
    transcript(sessions, 'forge', 'You are a toolsmith. Build tools.');
    const outcomes = path.join(dir, 'o.json');
    writeFileSync(outcomes, JSON.stringify({ good: true, bad: false }));
    const project = path.join(dir, 'project');
    mkdirSync(project);
    // The fake learner records its prompt and writes notes.
    const fake = path.join(dir, 'fake-claude');
    writeFileSync(fake, `#!/bin/sh\nprintf '%s' "$2" > ${JSON.stringify(path.join(dir, 'prompt.txt'))}\nmkdir -p .trod && printf '# Notes\\n- Enter does not submit; click Submit.\\n' > .trod/notes.md\nprintf '{"rules":[{"id":"submit","confirmed":1,"contradicted":1,"status":"new"}]}' > .trod/notes.evidence.json\necho '{"type":"result","subtype":"success","total_cost_usd":0.02,"num_turns":4}'\n`);
    chmodSync(fake, 0o755);
    process.env.TROD_CLAUDE_BIN = fake;
    const lines: string[] = [];
    const code = await main(['learn', '--dir', project, '--from', sessions, '--outcomes', outcomes], (s) => lines.push(s));
    expect(lines[0]).toBe('learning from 2 session(s) (1 passed, 1 failed, 0 unknown)');
    expect(code).toBe(0);
    const prompt = readFileSync(path.join(dir, 'prompt.txt'), 'utf8');
    expect(prompt).toContain('You are distilling experience');
    expect(prompt).toContain('No brief: learn from the sessions');
    const sessionsDir = prompt.match(/condensed in (\S+): INDEX\.md/)![1]!;
    expect(readdirSync(sessionsDir).map((f) => f.replace(/^\d+-/, '')).sort()).toEqual(['INDEX.md', 'fail.md', 'pass.md']);
    expect(readFileSync(path.join(project, 'CLAUDE.md'), 'utf8')).toContain('@.trod/notes.md');
  });

  it('fails when the learner changes nothing, even if notes already exist', async () => {
    const dir = tmp();
    const sessions = path.join(dir, 'sessions');
    mkdirSync(sessions);
    transcript(sessions, 's', 'Task: x');
    const project = path.join(dir, 'project');
    mkdirSync(path.join(project, '.trod'), { recursive: true });
    writeFileSync(path.join(project, '.trod', 'notes.md'), '# Notes\n- old rule\n');
    const fake = path.join(dir, 'fake-claude');
    writeFileSync(fake, `#!/bin/sh\necho '{"type":"result","subtype":"success","num_turns":1}'\n`);
    chmodSync(fake, 0o755);
    process.env.TROD_CLAUDE_BIN = fake;
    const lines: string[] = [];
    expect(await main(['learn', '--dir', project, '--from', sessions], (s) => lines.push(s))).toBe(1);
    expect(lines.join('\n')).toContain('changed nothing');
  });

  it('does not link notes from a learner that was stopped by --timeout', async () => {
    const dir = tmp();
    const sessions = path.join(dir, 'sessions');
    mkdirSync(sessions);
    transcript(sessions, 's', 'Task: x');
    const project = path.join(dir, 'project');
    mkdirSync(project);
    const fake = path.join(dir, 'fake-claude');
    writeFileSync(fake, `#!/bin/sh\nmkdir -p .trod && printf '# Notes\\n- half a rule\\n' > .trod/notes.md\nexec sleep 30\n`);
    chmodSync(fake, 0o755);
    process.env.TROD_CLAUDE_BIN = fake;
    const lines: string[] = [];
    // 0.01 minutes = 600 ms.
    expect(await main(['learn', '--dir', project, '--from', sessions, '--timeout', '0.01'], (s) => lines.push(s))).toBe(1);
    expect(lines.join('\n')).toContain('did not finish cleanly');
    expect(existsSync(path.join(project, 'CLAUDE.md'))).toBe(false);
  }, 15_000);

  it('fails clearly when there is nothing to learn from', async () => {
    const lines: string[] = [];
    const empty = tmp();
    expect(await main(['learn', '--dir', empty, '--from', path.join(empty, 'none')], (s) => lines.push(s))).toBe(1);
    expect(lines.join('\n')).toContain('no session transcripts found');
    expect(existsSync(path.join(empty, 'CLAUDE.md'))).toBe(false);
  });

  it('rejects a bad --limit', async () => {
    const dir = tmp();
    transcript(dir, 's', 'Task: x');
    const lines: string[] = [];
    expect(await main(['learn', '--dir', dir, '--from', dir, '--limit', '0'], (s) => lines.push(s))).toBe(1);
    expect(lines.join('\n')).toContain('--limit must be a positive integer');
  });
});

describe('--timeout', () => {
  it('rejects a timeout that is not a positive number', async () => {
    const lines: string[] = [];
    expect(await main(['learn', '--timeout', 'soon'], (s) => lines.push(s))).toBe(1);
    expect(lines.join('\n')).toContain('--timeout must be a positive number');
    lines.length = 0;
    expect(await main(['forge', '--brief', 'x', '--timeout', 'Infinity'], (s) => lines.push(s))).toBe(1);
    expect(lines.join('\n')).toContain('at most 35791');
  });
});

describe('trod learn, incremental and with an evidence ledger', () => {
  const saved = process.env.TROD_CLAUDE_BIN;
  afterEach(() => {
    if (saved === undefined) delete process.env.TROD_CLAUDE_BIN;
    else process.env.TROD_CLAUDE_BIN = saved;
  });

  /** A learner that counts its runs, appends a rule each time and keeps a ledger. */
  function setup() {
    const dir = tmp();
    const sessions = path.join(dir, 'sessions');
    mkdirSync(sessions);
    const project = path.join(dir, 'project');
    mkdirSync(project);
    const runs = path.join(dir, 'runs');
    const fake = path.join(dir, 'fake-claude');
    writeFileSync(
      fake,
      `#!/bin/sh
echo run >> ${JSON.stringify(runs)}
printf '%s' "$2" > ${JSON.stringify(path.join(dir, 'prompt.txt'))}
mkdir -p .trod && echo "- rule $(wc -l < ${JSON.stringify(runs)})" >> .trod/notes.md
printf '{"rules":[{"id":"submit-last","confirmed":3,"contradicted":1,"status":"kept"},{"id":"sleep-alone","confirmed":0,"contradicted":2,"status":"dropped"},{"id":"zoom","confirmed":1,"contradicted":0,"status":"new"}]}' > .trod/notes.evidence.json
echo '{"type":"result","subtype":"success","num_turns":1}'
`,
    );
    chmodSync(fake, 0o755);
    process.env.TROD_CLAUDE_BIN = fake;
    const runCount = () => (existsSync(runs) ? readFileSync(runs, 'utf8').trim().split('\n').length : 0);
    const learn = async (...extra: string[]) => {
      const lines: string[] = [];
      const code = await main(['learn', '--dir', project, '--from', sessions, ...extra], (s) => lines.push(s));
      return { code, out: lines.join('\n') };
    };
    return { dir, sessions, project, learn, runCount };
  }

  it('learns only from new sessions, and does nothing when there are none', async () => {
    const { dir, sessions, project, learn, runCount } = setup();
    transcript(sessions, 'a', 'Task: one');
    transcript(sessions, 'b', 'Task: two');
    let r = await learn();
    expect(r.code).toBe(0);
    expect(r.out).toContain('learning from 2 session(s)');
    expect(r.out).toContain('evidence: 3 rule(s): 1 kept, 0 fixed, 1 new, 1 dropped');
    expect(JSON.parse(readFileSync(path.join(project, '.trod', 'state', 'learn.json'), 'utf8')).sessions.sort()).toEqual(['a', 'b']);
    expect(readFileSync(path.join(project, '.trod', 'state', '.gitignore'), 'utf8')).toContain('*');

    r = await learn();
    expect(r.code).toBe(0);
    expect(r.out).toContain('nothing new since the last run');
    expect(runCount()).toBe(1);

    transcript(sessions, 'c', 'Task: three');
    r = await learn();
    expect(r.out).toContain('learning from 1 session(s)');
    const prompt = readFileSync(path.join(dir, 'prompt.txt'), 'utf8');
    expect(prompt).toContain('new since the last learning run');
    expect(prompt).toContain('.trod/notes.evidence.json');

    r = await learn('--all');
    expect(r.out).toContain('learning from 3 session(s)');
    expect(runCount()).toBe(3);
  });

  it('never learns from sessions that ran trod learn, and does not record a failed run', async () => {
    const { sessions, project, learn, runCount } = setup();
    transcript(sessions, 'sched', 'trod-learn-run-7c1e5a Run npx -y trod learn');
    // The skill body recorded as a hidden (meta) message counts too.
    writeFileSync(path.join(sessions, 'meta.jsonl'), [{ type: 'user', message: { content: '/trod:learn' } }, { type: 'user', isMeta: true, message: { content: 'trod-learn-run-7c1e5a (marker)' } }].map((l) => JSON.stringify(l)).join('\n'));
    let r = await learn();
    expect(r.code).toBe(0);
    expect(r.out).toContain('nothing to learn from yet');
    expect(runCount()).toBe(0);
    transcript(sessions, 'real', 'Task: real work');
    writeFileSync(process.env.TROD_CLAUDE_BIN!, '#!/bin/sh\nexit 3\n');
    r = await learn();
    expect(r.code).toBe(1);
    expect(existsSync(path.join(project, '.trod', 'state', 'learn.json'))).toBe(false);
  });
});

describe('trod learn guards', () => {
  const saved = process.env.TROD_CLAUDE_BIN;
  afterEach(() => {
    if (saved === undefined) delete process.env.TROD_CLAUDE_BIN;
    else process.env.TROD_CLAUDE_BIN = saved;
  });

  function learner(dir: string, ledger: string | undefined) {
    const fake = path.join(dir, `fake-${Math.random().toString(36).slice(2)}`);
    writeFileSync(fake, `#!/bin/sh\nmkdir -p .trod && date +%s%N >> .trod/notes.md\n${ledger === undefined ? 'rm -f .trod/notes.evidence.json' : `printf '%s' '${ledger}' > .trod/notes.evidence.json`}\necho '{"type":"result","subtype":"success","num_turns":1}'\n`);
    chmodSync(fake, 0o755);
    process.env.TROD_CLAUDE_BIN = fake;
  }

  it('fails, and records nothing, when the learner skips or breaks the ledger', async () => {
    const dir = tmp();
    const sessions = path.join(dir, 's');
    mkdirSync(sessions);
    transcript(sessions, 'one', 'Task: one');
    const project = path.join(dir, 'p');
    mkdirSync(project);
    const run = async () => {
      const lines: string[] = [];
      const code = await main(['learn', '--dir', project, '--from', sessions], (s) => lines.push(s));
      return { code, out: lines.join('\n') };
    };
    learner(dir, undefined);
    let r = await run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('notes.evidence.json is missing');
    expect(existsSync(path.join(project, '.trod', 'state', 'learn.json'))).toBe(false);

    learner(dir, '{"rules":[{"id":"a","confirmed":2,"contradicted":0,"status":"kept"},{"id":"b","confirmed":0,"contradicted":3,"status":"dropped"}]}');
    expect((await run()).code).toBe(0);

    transcript(sessions, 'two', 'Task: two');
    learner(dir, '{"rules":[{"id":"a","confirmed":1,"contradicted":0,"status":"kept"}]}');
    r = await run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('rule "b" disappeared');
    expect(r.out).toContain('counts of "a" went down');
    expect(JSON.parse(readFileSync(path.join(project, '.trod', 'state', 'learn.json'), 'utf8')).sessions).toEqual(['one']);
  });

  it('does nothing while another run holds the lock', async () => {
    const dir = tmp();
    mkdirSync(path.join(dir, '.trod', 'state'), { recursive: true });
    writeFileSync(path.join(dir, '.trod', 'state', 'learn.lock'), String(process.pid));
    transcript(dir, 'x', 'Task: x');
    const lines: string[] = [];
    expect(await main(['learn', '--dir', dir, '--from', dir], (s) => lines.push(s))).toBe(0);
    expect(lines.join('\n')).toContain('another trod learn run is in progress');
  });
});

describe('the evidence ledger', () => {
  it('summarizes rules and reports malformed entries', () => {
    const dir = tmp();
    mkdirSync(path.join(dir, '.trod'));
    writeFileSync(path.join(dir, '.trod', 'notes.evidence.json'), JSON.stringify({ rules: [{ id: 'a', confirmed: 1, contradicted: 4, status: 'kept' }, { id: 'b', confirmed: 2, contradicted: 0, status: 'fixed' }, { id: 'c', status: 'maybe' }] }));
    const ledger = readLedger(dir);
    expect(ledger.rules).toHaveLength(2);
    expect(ledger.errors.join(' ')).toContain('rule 3');
    expect(summarizeLedger(ledger.rules)).toBe('2 rule(s): 1 kept, 1 fixed, 0 new, 0 dropped; 1 contradicted more often than confirmed');
    expect(readLedger(tmp()).exists).toBe(false);
  });

  it('only grows, except that --all may recount', () => {
    const before = [{ id: 'a', confirmed: 3, contradicted: 1, status: 'kept' as const }, { id: 'd', confirmed: 0, contradicted: 2, status: 'dropped' as const }];
    expect(checkLedgerHistory(before, [{ ...before[0], confirmed: 4 }, before[1]], false)).toEqual([]);
    expect(checkLedgerHistory(before, [{ ...before[0], confirmed: 1 }, { ...before[1], status: 'new' }], false)).toHaveLength(2);
    expect(checkLedgerHistory(before, [{ ...before[0], confirmed: 1 }, before[1]], true)).toEqual([]);
  });
});

describe('the learner session', () => {
  const saved = { bin: process.env.TROD_CLAUDE_BIN, cc: process.env.CLAUDECODE };
  afterEach(() => {
    for (const [k, v] of [['TROD_CLAUDE_BIN', saved.bin], ['CLAUDECODE', saved.cc]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('starts without the nested-session marker, so it runs from inside a Claude Code session', async () => {
    const dir = tmp();
    const sessions = path.join(dir, 's');
    mkdirSync(sessions);
    transcript(sessions, 'one', 'Task: one');
    const project = path.join(dir, 'p');
    mkdirSync(project);
    const fake = path.join(dir, 'fake');
    // Fails like a real nested claude would if CLAUDECODE is still set.
    writeFileSync(fake, `#!/bin/sh\n[ -n "$CLAUDECODE" ] && { echo nested >&2; exit 1; }\nmkdir -p .trod && echo '- a rule' > .trod/notes.md\nprintf '{"rules":[{"id":"a","confirmed":1,"contradicted":0,"status":"new"}]}' > .trod/notes.evidence.json\necho '{"type":"result","subtype":"success","num_turns":1}'\n`);
    chmodSync(fake, 0o755);
    process.env.TROD_CLAUDE_BIN = fake;
    process.env.CLAUDECODE = '1';
    const lines: string[] = [];
    expect(await main(['learn', '--dir', project, '--from', sessions], (s) => lines.push(s))).toBe(0);
  });

  it('marks sessions as learned once the ledger counted them, even when a note check fails', async () => {
    const dir = tmp();
    const sessions = path.join(dir, 's');
    mkdirSync(sessions);
    transcript(sessions, 'one', 'Task: one');
    const project = path.join(dir, 'p');
    mkdirSync(project);
    const fake = path.join(dir, 'fake');
    // A check that names a tool that does not exist fails.
    writeFileSync(fake, `#!/bin/sh\nmkdir -p .trod && echo '- a rule' > .trod/notes.md\nprintf '[{"claim":"x","tool":"missing_tool","expect":{"contains":"y"}}]' > .trod/notes.checks.json\nprintf '{"rules":[{"id":"a","confirmed":1,"contradicted":0,"status":"new"}]}' > .trod/notes.evidence.json\necho '{"type":"result","subtype":"success","num_turns":1}'\n`);
    chmodSync(fake, 0o755);
    process.env.TROD_CLAUDE_BIN = fake;
    const lines: string[] = [];
    expect(await main(['learn', '--dir', project, '--from', sessions], (s) => lines.push(s))).toBe(1);
    expect(JSON.parse(readFileSync(path.join(project, '.trod', 'state', 'learn.json'), 'utf8')).sessions).toEqual(['one']);
  });
});
