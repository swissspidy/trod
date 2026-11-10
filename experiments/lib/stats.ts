/** Small statistics for comparing arms: no dependencies. */

/** 95% Wilson score interval for k successes in n trials. */
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
}

/** Exact two-sided McNemar test: b tasks only the first arm passed, c only the second. */
export function mcnemar(b: number, c: number): number {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  let logChoose = 0;
  let tail = 0;
  for (let i = 0; i <= k; i++) {
    if (i > 0) logChoose += Math.log(n - i + 1) - Math.log(i);
    tail += Math.exp(logChoose - n * Math.LN2);
  }
  return Math.min(1, 2 * tail);
}
