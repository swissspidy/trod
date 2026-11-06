export type ToolSource = 'session' | 'library';

export interface ExampleExpectation {
  /** The output (as text) contains this string. */
  contains?: string;
  /** The output (as text) matches this regular expression. */
  matches?: string;
  /** The structured result deep-equals this value (or the text output equals it, for strings). */
  equals?: unknown;
}

export interface ToolExample {
  description?: string;
  input: Record<string, unknown>;
  expect?: ExampleExpectation;
}

export interface ToolProvenance {
  sessionId?: string;
  reason?: string;
  createdAt?: string;
  promotedAt?: string;
}

/** The contents of `tool.json`. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  whenToUse: string;
  examples?: ToolExample[];
  timeoutMs?: number;
  provenance?: ToolProvenance;
}

export type RunnerKind = 'mjs' | 'sh';

export interface ExampleReport {
  passed: number;
  failed: number;
  /** Set when examples were not run (for example because execution is disabled). */
  skipped?: string;
  failures: string[];
}

export interface LoadedTool {
  /** Folder name, which must equal `def.name` for a valid tool. */
  folder: string;
  dir: string;
  source: ToolSource;
  /** Content hash of tool.json and the run file. */
  hash: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  def?: ToolDefinition;
  runner?: RunnerKind;
  runPath?: string;
  examples?: ExampleReport;
}

export interface RunResult {
  ok: boolean;
  /** Text shown to the agent (already truncated). */
  text: string;
  /** Structured result, when the tool returned one. */
  value?: unknown;
  error?: string;
  durationMs: number;
  outputChars: number;
  truncated: boolean;
  timedOut: boolean;
}

export interface TrodPaths {
  projectDir: string;
  trodDir: string;
  toolsDir: string;
  libraryDir: string;
  logsDir: string;
}
