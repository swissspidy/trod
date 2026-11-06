import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Task, TaskContext } from '../lib/types.ts';
import { rng, write } from '../lib/util.ts';

const TOPICS = ['install', 'config', 'deploy', 'testing', 'faq', 'api', 'cli', 'plugins', 'security', 'release'];
const HEAD = ['Overview', 'Getting Started', 'Options & Flags', 'Known Issues', 'Usage (advanced)', 'Next steps'];
const OUT = ['broken.json', 'broken-2.json', 'broken-3.json'];

/** GitHub-style heading slug, as defined in the prompt. */
const slug = (h: string) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

/** One revision of the docs tree and its broken links. */
function docs(step: number) {
  const r = rng(707 + step * 1000);
  const files: { rel: string; heads: string[] }[] = [];
  for (let i = 0; i < 25; i++) {
    const dir = r.pick(['', '', 'guides/', 'reference/']);
    files.push({ rel: `${dir}${TOPICS[i % TOPICS.length]}-${i}.md`, heads: [...new Set(Array.from({ length: r.int(2, 4) }, () => r.pick(HEAD)))] });
  }
  const broken = new Set<string>();
  const out: Record<string, string> = { 'img/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' };
  for (const f of files) {
    const lines = [`# ${f.rel}`, ''];
    for (const h of f.heads) lines.push(`## ${h}`, '', 'Some prose.', '');
    for (let j = 0, n = r.int(3, 7); j < n; j++) {
      const other = r.pick(files);
      let target = path.posix.relative(path.posix.dirname(f.rel), other.rel);
      if (!target.startsWith('.') && r.chance(0.5)) target = `./${target}`;
      const kind = r.int(0, 9);
      let isBroken = false;
      let image = false;
      if (kind === 0) {
        target = target.replace('.md', '-old.md');
        isBroken = true;
      } else if (kind <= 2) {
        const h = r.chance(0.7) ? r.pick(other.heads) : 'Missing Section';
        target = `${target}#${slug(h)}`;
        isBroken = !other.heads.some((x) => slug(x) === slug(h));
      } else if (kind === 3) {
        const h = r.chance(0.6) ? r.pick(f.heads) : 'Not Here';
        target = `#${slug(h)}`;
        isBroken = !f.heads.some((x) => slug(x) === slug(h));
      } else if (kind === 4) {
        target = r.chance(0.5) ? 'https://example.com/x.md' : 'mailto:docs@example.com';
      } else if (kind === 5) {
        image = true;
        target = r.chance(0.5) ? '../assets/missing.png' : path.posix.relative(path.posix.dirname(f.rel), 'img/logo.svg');
        isBroken = target.includes('missing');
      }
      if (isBroken) broken.add(`${f.rel}: ${target}`);
      lines.push(image ? `![logo](${target})` : `See [link ${j}](${target}) for more.`, '');
    }
    if (r.chance(0.4)) lines.push('```md', '[not a link](./nowhere.md)', '```', '');
    out[f.rel] = lines.join('\n');
  }
  return { files: out, broken: [...broken].sort() };
}

function writeDocs({ work }: TaskContext, step: number) {
  rmSync(path.join(work, 'docs'), { recursive: true, force: true });
  for (const [rel, content] of Object.entries(docs(step).files)) write(work, `docs/${rel}`, content);
}

const check = (i: number) => ({ work }: TaskContext, expected: string[][]) => {
  const want = expected[i]!;
  const p = path.join(work, OUT[i]!);
  if (!existsSync(p)) return { pass: false, score: 0, details: `${OUT[i]} missing` };
  let got: string[];
  try {
    got = JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return { pass: false, score: 0, details: `${OUT[i]} is not JSON` };
  }
  if (!Array.isArray(got)) return { pass: false, score: 0, details: `${OUT[i]} is not an array` };
  const wantSet = new Set(want);
  const have = new Set(got);
  const missing = want.filter((x) => !have.has(x));
  const extra = got.filter((x) => !wantSet.has(x));
  return {
    pass: missing.length === 0 && extra.length === 0,
    score: Math.max(0, (want.length - missing.length - extra.length) / want.length),
    details:
      `${want.length - missing.length}/${want.length} found, ${extra.length} false positives` +
      (missing.length ? `; missing e.g. ${missing.slice(0, 3).join(' | ')}` : '') +
      (extra.length ? `; extra e.g. ${extra.slice(0, 3).join(' | ')}` : ''),
  };
};

/** Find broken relative links and anchors in 25 Markdown files, after each of three doc revisions. */
const task: Task = {
  id: 'md-links',
  title: 'Find broken links and anchors in 25 Markdown docs, 3 revisions',
  kind: 'repetitive',
  repetitions: 25,
  setup: (ctx) => {
    writeDocs(ctx, 0);
    return [0, 1, 2].map((s) => docs(s).broken);
  },
  prepareStep: writeDocs,
  steps: [
    {
      prompt: () => `docs/ contains 25 Markdown files, some in subdirectories. Find every broken relative link.

A link is any inline Markdown link or image [text](target) or ![alt](target). Ignore targets that start with http://, https:// or mailto:. Ignore links inside fenced code blocks (\`\`\`).
A relative target is broken when:
- its file part (resolved relative to the linking file) does not exist, or
- it has a #fragment and the target file (or the same file, for "#fragment" alone) has no heading whose GitHub-style slug equals the fragment. Slug: lowercase, remove every character that is not a letter, digit, space or hyphen, then replace each space with a hyphen.

Write broken.json: a JSON array of strings "<file>: <target>" where <file> is the linking file's path relative to docs/ (e.g. "guides/deploy-2.md") and <target> is the link target exactly as written, sorted alphabetically, without duplicates.
The docs are being rewritten, so I will ask for this check again. When finished, reply DONE.`,
      check: check(0),
    },
    {
      prompt: () => `The docs/ tree was just rewritten (files, headings and links changed). Run the same broken-link check and write broken-2.json. When finished, reply DONE.`,
      check: check(1),
    },
    {
      prompt: () => `docs/ changed again. Same check, write broken-3.json. When finished, reply DONE.`,
      check: check(2),
    },
  ],
};
export default task;
