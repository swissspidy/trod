import { describe, expect, it } from 'vitest';
import { parseDjangoLog } from '../swe/swe.ts';

describe('parseDjangoLog', () => {
  it('reads plain, docstring and stderr-interrupted results', () => {
    const log = [
      'test_a (app.tests.T) ... ok',
      'test_b (app.tests.T)',
      'Docstring of b. ... FAIL',
      'test_c (app.tests.T) ... warning: something on stderr',
      'more noise',
      'ok',
      'test_d (app.tests.T) ... skipped "needs pylibmc"',
      'test_e (app.tests.T) ... expected failure',
      'test_f (app.tests.T) ... ERROR',
    ].join('\n');
    const s = parseDjangoLog(log);
    expect(s.get('test_a (app.tests.T)')).toBe('ok');
    expect(s.get('test_b (app.tests.T)')).toBe('FAIL');
    expect(s.get('Docstring of b.')).toBe('FAIL');
    expect(s.get('test_c (app.tests.T)')).toBe('ok');
    expect(s.get('test_d (app.tests.T)')).toBe('skipped');
    expect(s.get('test_e (app.tests.T)')).toBe('expected failure');
    expect(s.get('test_f (app.tests.T)')).toBe('ERROR');
  });
});
