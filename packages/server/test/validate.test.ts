import { describe, expect, it } from 'vitest';
import { checkDefinition, checkExpectation, loadToolFolder } from '../src/validate.ts';
import { tempProject, writeTool } from './helpers.ts';

const base = {
  name: 'count_lines',
  description: 'Counts lines in a file and returns the number.',
  whenToUse: 'When you need a line count.',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  provenance: { reason: 'test' },
};

describe('checkDefinition', () => {
  it('accepts a complete definition', () => {
    const res = checkDefinition(base, 'count_lines');
    expect(res.errors).toEqual([]);
    expect(res.def?.name).toBe('count_lines');
  });

  it('rejects bad names, reserved names and folder mismatches', () => {
    expect(checkDefinition({ ...base, name: 'Count-Lines' }, 'Count-Lines').errors.join()).toMatch(/must match/);
    expect(checkDefinition({ ...base, name: 'trod_status' }, 'trod_status').errors.join()).toMatch(/reserved/);
    expect(checkDefinition(base, 'other').errors.join()).toMatch(/folder name/);
  });

  it('requires description, whenToUse and an object inputSchema', () => {
    const errors = checkDefinition({ name: 'x_tool', inputSchema: { type: 'string' } }, 'x_tool').errors.join('\n');
    expect(errors).toMatch(/description/);
    expect(errors).toMatch(/whenToUse/);
    expect(errors).toMatch(/inputSchema.type/);
  });

  it('rejects an invalid JSON Schema', () => {
    const res = checkDefinition({ ...base, inputSchema: { type: 'object', properties: { a: { type: 'nope' } } } }, 'count_lines');
    expect(res.errors.join()).toMatch(/not a valid JSON Schema/);
  });

  it('checks examples and warns about unknown keys and missing provenance', () => {
    const { provenance: _p, ...noProv } = base;
    const res = checkDefinition({ ...noProv, extra: 1, examples: [{ input: {}, expect: {} }, { input: 'x' }] }, 'count_lines');
    expect(res.errors.join('\n')).toMatch(/examples\[0\].expect needs/);
    expect(res.errors.join('\n')).toMatch(/examples\[1\].input/);
    expect(res.warnings.join('\n')).toMatch(/unknown key "extra"/);
    expect(res.warnings.join('\n')).toMatch(/provenance/);
  });
});

describe('loadToolFolder', () => {
  it('loads a valid tool', async () => {
    const { toolsDir } = tempProject();
    const dir = writeTool(toolsDir, 'echo_it', {});
    const t = await loadToolFolder(dir, 'session');
    expect(t.errors).toEqual([]);
    expect(t.ok).toBe(true);
    expect(t.runner).toBe('mjs');
  });

  it('reports syntax errors in run.mjs and run.sh', async () => {
    const { toolsDir } = tempProject();
    const a = await loadToolFolder(writeTool(toolsDir, 'bad_js', {}, { mjs: 'export default async ( => 1' }), 'session');
    expect(a.ok).toBe(false);
    expect(a.errors.join()).toMatch(/syntax error in run.mjs/);
    const b = await loadToolFolder(writeTool(toolsDir, 'bad_sh', {}, { sh: 'if then fi (' }), 'session');
    expect(b.errors.join()).toMatch(/syntax error in run.sh/);
  });

  it('reports invalid JSON, missing run files and both run files', async () => {
    const { toolsDir } = tempProject();
    expect((await loadToolFolder(writeTool(toolsDir, 'bad_json', '{nope'), 'session')).errors.join()).toMatch(/not valid JSON/);
    expect((await loadToolFolder(writeTool(toolsDir, 'no_run', {}, {}), 'session')).errors.join()).toMatch(/missing run.mjs/);
    expect((await loadToolFolder(writeTool(toolsDir, 'both_run', {}, { mjs: 'export default () => 1', sh: 'echo 1' }), 'session')).errors.join()).toMatch(/both/);
  });

  it('validates example inputs against the schema', async () => {
    const { toolsDir } = tempProject();
    const t = await loadToolFolder(
      writeTool(toolsDir, 'typed', { inputSchema: { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] }, examples: [{ input: { n: 'x' } }] }),
      'session',
    );
    expect(t.errors.join()).toMatch(/examples\[0\]: input\/n must be number/);
  });
});

describe('checkExpectation', () => {
  it('supports contains, matches and equals', () => {
    expect(checkExpectation({ contains: 'ab' }, 'xaby', 'xaby')).toBeUndefined();
    expect(checkExpectation({ contains: 'zz' }, 'xaby', 'xaby')).toMatch(/does not contain/);
    expect(checkExpectation({ matches: '^\\d+$' }, '42', 42)).toBeUndefined();
    expect(checkExpectation({ equals: { a: 1, b: [2] } }, '', { b: [2], a: 1 })).toBeUndefined();
    expect(checkExpectation({ equals: 3 }, '4', 4)).toMatch(/does not equal/);
    expect(checkExpectation({ equals: 'hi' }, 'hi\n', 'hi\n')).toBeUndefined();
  });
});
