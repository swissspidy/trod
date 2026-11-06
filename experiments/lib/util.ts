import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CheckResult } from './types.ts';

/** Deterministic PRNG (mulberry32), so every arm and seed gets the same fixture. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
  };
}

export function write(root: string, rel: string, content: string): void {
  const p = path.join(root, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, content);
}

export function readJson(root: string, rel: string): { ok: true; value: any } | { ok: false; error: string } {
  const p = path.join(root, rel);
  if (!existsSync(p)) return { ok: false, error: `${rel} does not exist` };
  try {
    return { ok: true, value: JSON.parse(readFileSync(p, 'utf8')) };
  } catch (err) {
    return { ok: false, error: `${rel} is not valid JSON: ${(err as Error).message}` };
  }
}

export function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as any)[k])]));
  return v;
}

export const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** Scores a keyed result: the fraction of expected keys whose values match. */
export function scoreKeyed(expected: Record<string, unknown>, actual: Record<string, unknown> | undefined, threshold = 1): CheckResult {
  const keys = Object.keys(expected);
  if (!actual || typeof actual !== 'object') return { pass: false, score: 0, details: 'no result object' };
  const wrong = keys.filter((k) => !same(expected[k], actual[k]));
  const extra = Object.keys(actual).filter((k) => !(k in expected));
  const score = (keys.length - wrong.length) / keys.length;
  const details =
    `${keys.length - wrong.length}/${keys.length} correct` +
    (wrong.length ? `; wrong: ${wrong.slice(0, 5).map((k) => `${k} (got ${JSON.stringify(actual[k])?.slice(0, 120)}, want ${JSON.stringify(expected[k])?.slice(0, 120)})`).join('; ')}` : '') +
    (extra.length ? `; ${extra.length} unexpected keys` : '');
  return { pass: score >= threshold && extra.length === 0, score, details };
}

export const fail = (details: string): CheckResult => ({ pass: false, score: 0, details });
