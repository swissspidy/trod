import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import AjvModule, { type ValidateFunction } from 'ajv';
import { MAX_TIMEOUT_MS, scrubEnv } from './executor.ts';
import type { ExampleExpectation, LoadedTool, RunnerKind, ToolDefinition, ToolSource } from './types.ts';

const execFileAsync = promisify(execFile);

export const NAME_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;
export const RESERVED_NAMES = new Set(['trod_status', 'trod_run', 'trod_eval']);
const KNOWN_KEYS = new Set(['name', 'description', 'inputSchema', 'whenToUse', 'examples', 'timeoutMs', 'provenance']);

// Ajv's default export shape differs between its CJS and ESM builds.
type AjvInstance = import('ajv').default;
type AjvCtor = new (opts: { allErrors: boolean; strict: boolean }) => AjvInstance;
const mod = AjvModule as unknown as AjvCtor & { default?: AjvCtor };
const Ajv: AjvCtor = mod.default ?? mod;
export const ajv: AjvInstance = new Ajv({ allErrors: true, strict: false });

export function hashTool(dir: string): string {
  const h = createHash('sha256');
  if (dir.endsWith('.mjs')) return h.update(existsSync(dir) ? readFileSync(dir) : '').digest('hex');
  for (const file of ['tool.json', 'run.mjs', 'run.sh']) {
    const p = path.join(dir, file);
    h.update(file + '\0');
    if (existsSync(p)) h.update(readFileSync(p));
    h.update('\0');
  }
  return h.digest('hex');
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Checks tool.json's shape. Returns errors and warnings; never throws. */
export function checkDefinition(raw: unknown, folder: string): { errors: string[]; warnings: string[]; def?: ToolDefinition } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObject(raw)) return { errors: ['tool.json must contain a JSON object'], warnings };
  const { name, description, inputSchema, whenToUse, examples, timeoutMs, provenance } = raw;

  if (typeof name !== 'string') errors.push('"name" is required and must be a string');
  else {
    if (!NAME_PATTERN.test(name)) errors.push(`"name" must match ${NAME_PATTERN} (lowercase letters, digits, underscores; 2-48 chars), got "${name}"`);
    if (RESERVED_NAMES.has(name)) errors.push(`"${name}" is reserved by trod`);
    if (name !== folder) errors.push(`"name" ("${name}") must equal the folder name ("${folder}")`);
  }
  if (typeof description !== 'string' || description.trim().length < 10)
    errors.push('"description" is required: a precise sentence about what the tool does and returns (10+ chars)');
  if (typeof whenToUse !== 'string' || !whenToUse.trim())
    errors.push('"whenToUse" is required: when the agent should pick this tool over Bash or another tool');

  if (!isObject(inputSchema)) errors.push('"inputSchema" is required and must be a JSON Schema object');
  else {
    if (inputSchema.type !== 'object') errors.push('"inputSchema.type" must be "object"');
    try {
      ajv.compile(inputSchema);
    } catch (err) {
      errors.push(`"inputSchema" is not a valid JSON Schema: ${(err as Error).message}`);
    }
  }

  if (examples !== undefined) {
    if (!Array.isArray(examples)) errors.push('"examples" must be an array');
    else
      examples.forEach((ex, i) => {
        if (!isObject(ex) || !isObject(ex.input)) errors.push(`examples[${i}].input must be an object`);
        else if (ex.expect !== undefined) {
          if (!isObject(ex.expect)) errors.push(`examples[${i}].expect must be an object`);
          else {
            const e = ex.expect as ExampleExpectation;
            if (e.contains === undefined && e.matches === undefined && !('equals' in e))
              errors.push(`examples[${i}].expect needs one of "contains", "matches" or "equals"`);
            if (e.matches !== undefined) {
              try {
                new RegExp(e.matches);
              } catch (err) {
                errors.push(`examples[${i}].expect.matches is not a valid regular expression: ${(err as Error).message}`);
              }
            }
          }
        }
      });
  }

  if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS))
    errors.push(`"timeoutMs" must be a number between 1 and ${MAX_TIMEOUT_MS}`);
  if (provenance !== undefined && !isObject(provenance)) errors.push('"provenance" must be an object');
  else if (provenance === undefined) warnings.push('no "provenance": add { "reason": "why this tool was built" }');

  for (const key of Object.keys(raw)) if (!KNOWN_KEYS.has(key)) warnings.push(`unknown key "${key}" is ignored`);

  if (errors.length) return { errors, warnings };
  return { errors, warnings, def: raw as unknown as ToolDefinition };
}

const validators = new WeakMap<object, ValidateFunction>();

/** Validates a tool input against its inputSchema. Returns error messages (empty when valid). */
export function validateInput(def: ToolDefinition, input: unknown): string[] {
  let validate: ValidateFunction | undefined = validators.get(def.inputSchema);
  if (!validate) {
    validate = ajv.compile(def.inputSchema) as ValidateFunction;
    validators.set(def.inputSchema, validate);
  }
  if (validate(input)) return [];
  return (validate.errors ?? []).map((e) => `input${e.instancePath} ${e.message ?? 'is invalid'}`);
}

async function checkSyntax(runner: RunnerKind, runPath: string): Promise<string | undefined> {
  try {
    if (runner === 'mjs') await execFileAsync(process.execPath, ['--check', runPath], { timeout: 10_000 });
    else await execFileAsync('bash', ['-n', runPath], { timeout: 10_000 });
    return undefined;
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    return `syntax error in ${path.basename(runPath)}: ${(e.stderr || e.message).trim().split('\n').slice(0, 6).join('\n')}`;
  }
}

/** Static checks of one tool folder: tool.json, run file, syntax. Examples are run separately. */
export async function loadToolFolder(dir: string, source: ToolSource): Promise<LoadedTool> {
  const folder = path.basename(dir);
  const tool: LoadedTool = { folder, dir, source, hash: hashTool(dir), ok: false, errors: [], warnings: [] };
  const jsonPath = path.join(dir, 'tool.json');
  if (!existsSync(jsonPath)) {
    tool.errors.push('missing tool.json');
    return tool;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (err) {
    tool.errors.push(`tool.json is not valid JSON: ${(err as Error).message}`);
    return tool;
  }
  const { errors, warnings, def } = checkDefinition(raw, folder);
  tool.errors.push(...errors);
  tool.warnings.push(...warnings);

  const hasMjs = existsSync(path.join(dir, 'run.mjs'));
  const hasSh = existsSync(path.join(dir, 'run.sh'));
  if (hasMjs && hasSh) tool.errors.push('has both run.mjs and run.sh; keep exactly one');
  else if (!hasMjs && !hasSh) tool.errors.push('missing run.mjs (export default async (input, ctx) => result) or run.sh (input JSON on stdin)');
  else {
    tool.runner = hasMjs ? 'mjs' : 'sh';
    tool.runPath = path.join(dir, hasMjs ? 'run.mjs' : 'run.sh');
    const syntax = await checkSyntax(tool.runner, tool.runPath);
    if (syntax) tool.errors.push(syntax);
  }

  if (def) {
    tool.def = def;
    def.examples?.forEach((ex, i) => {
      for (const msg of validateInput(def, ex.input)) tool.errors.push(`examples[${i}]: ${msg}`);
    });
  }
  tool.ok = tool.errors.length === 0;
  return tool;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (isObject(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  return v;
}

/** Returns a failure message, or undefined when the output satisfies the expectation. */
export function checkExpectation(expect: ExampleExpectation | undefined, text: string, value: unknown): string | undefined {
  if (!expect) return undefined;
  if (expect.contains !== undefined && !text.includes(expect.contains))
    return `output does not contain ${JSON.stringify(expect.contains)}`;
  if (expect.matches !== undefined && !new RegExp(expect.matches).test(text))
    return `output does not match /${expect.matches}/`;
  if ('equals' in expect) {
    const ok = typeof expect.equals === 'string' ? text.trim() === expect.equals.trim() || deepEqual(value, expect.equals) : deepEqual(value, expect.equals);
    if (!ok) return `output ${JSON.stringify(value)?.slice(0, 200)} does not equal ${JSON.stringify(expect.equals)?.slice(0, 200)}`;
  }
  return undefined;
}

export interface LoadOptions {
  /** Single-file tools need execution to read their meta export. */
  execAllowed: boolean;
  env?: NodeJS.ProcessEnv;
}

/** Imports a single-file tool in a subprocess and prints its `meta` export as JSON. */
const META_READER = `
import { pathToFileURL } from 'node:url';
const mod = await import(pathToFileURL(process.argv[1]).href);
if (typeof mod.default !== 'function') throw new Error('the file must default-export a function: export default async (input, ctx) => result');
if (!mod.meta || typeof mod.meta !== 'object') throw new Error('the file must export meta: export const meta = { description, whenToUse, inputSchema }');
process.stdout.write(JSON.stringify(mod.meta));
`;

/**
 * A single-file tool: .trod/tools/<name>.mjs with `export const meta = { description, whenToUse, inputSchema, … }`
 * and `export default async (input, ctx) => result`. One Write creates it.
 */
export async function loadToolFile(file: string, source: ToolSource, opts: LoadOptions): Promise<LoadedTool> {
  const folder = path.basename(file, '.mjs');
  const tool: LoadedTool = { folder, dir: path.dirname(file), source, hash: hashTool(file), ok: false, errors: [], warnings: [], runner: 'mjs', runPath: file };
  const syntax = await checkSyntax('mjs', file);
  if (syntax) {
    tool.errors.push(syntax);
    return tool;
  }
  if (!opts.execAllowed) {
    tool.errors.push('single-file tools (<name>.mjs) are loaded by importing them, which needs TROD_ALLOW_EXEC=1');
    return tool;
  }
  let meta: unknown;
  try {
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', META_READER, file], {
      cwd: path.dirname(file),
      env: scrubEnv(opts.env ?? process.env),
      timeout: 10_000,
    });
    meta = JSON.parse(stdout);
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    // Node prints the failing source line before the error itself: pick the "SomeError: message" line.
    const lines = (e.stderr || e.message).trim().split('\n');
    const msg = lines.find((l) => /^\s*([A-Z]\w*)?Error\b.*:/.test(l)) ?? lines.find((l) => /Error/.test(l)) ?? lines[0];
    tool.errors.push(`could not load ${path.basename(file)}: ${msg}`);
    return tool;
  }
  const raw = { name: folder, ...(meta as Record<string, unknown>) };
  const { errors, warnings, def } = checkDefinition(raw, folder);
  tool.errors.push(...errors);
  tool.warnings.push(...warnings.filter((w) => !w.startsWith('unknown key "name"')));
  if (def) {
    tool.def = def;
    def.examples?.forEach((ex, i) => {
      for (const msg of validateInput(def, ex.input)) tool.errors.push(`examples[${i}]: ${msg}`);
    });
  }
  tool.ok = tool.errors.length === 0;
  return tool;
}

/** Loads a tool entry: a folder (tool.json + run file) or a single .mjs file. */
export function loadToolEntry(entry: string, source: ToolSource, opts: LoadOptions): Promise<LoadedTool> {
  return entry.endsWith('.mjs') ? loadToolFile(entry, source, opts) : loadToolFolder(entry, source);
}

/** Tool entries under a root: folders and *.mjs files, sorted. */
export function listToolEntries(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.') && (d.isDirectory() || (d.isFile() && d.name.endsWith('.mjs'))))
    .map((d) => path.join(root, d.name))
    .sort();
}
