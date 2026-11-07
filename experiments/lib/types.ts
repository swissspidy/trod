import type { IncomingMessage, ServerResponse } from 'node:http';

export interface CheckResult {
  pass: boolean;
  /** 0..1 */
  score: number;
  details: string;
  /** The check could not be completed (infrastructure, not the agent): excluded from scores. */
  infra?: boolean;
}

export interface TaskContext {
  /** The agent's working directory. */
  work: string;
  /** Base URL of the task's fixture server, when it has one. */
  baseUrl?: string;
}

/** Mutable state shared with the fixture server: which step the run is on (0-based). */
export interface FixtureState {
  step: number;
}

export interface Step {
  prompt(ctx: TaskContext): string;
  check(ctx: TaskContext, expected: any): CheckResult | Promise<CheckResult>;
}

/**
 * A task is a short session: the first step's prompt starts it, later steps arrive as follow-up prompts in the
 * same session (claude -p --resume), usually with new data. Repetition therefore happens within a step
 * (many items: batchable) and across steps (the same kind of work again: what a tool can be reused for).
 */
export interface Task {
  id: string;
  title: string;
  /** "repetitive" tasks have repetition built in; "control" tasks are one-offs. */
  kind: 'repetitive' | 'control';
  /** Items per step (for the report). */
  repetitions: number;
  /** Writes the first step's fixture into ctx.work and returns the expected outcome for every step. */
  setup(ctx: TaskContext): any;
  /** Writes or changes fixture files before step `step` (1-based for follow-ups; never called for step 0). */
  prepareStep?(ctx: TaskContext, step: number): void;
  /** Optional fixture HTTP server. */
  handler?: (expected: any, state: FixtureState) => (req: IncomingMessage, res: ServerResponse) => void;
  steps: Step[];
  /** For the toolsmith arm: what future sessions will do here (default: the first step's prompt). */
  toolsmithBrief?(ctx: TaskContext): string;
  /** Tasks that share an environment share one forge (e.g. all instances of one repository). Default: the task id. */
  forgeKey?: string;
  /** Prepares the forge's checkout (default: setup). */
  forgeSetup?(ctx: TaskContext): void;
  /** Extra environment variables for the agent's session (and the trod server), e.g. a virtualenv on PATH. */
  env?(ctx: TaskContext): Record<string, string>;
  /** Called after the run's result is written, e.g. to delete a large checkout. */
  afterRun?(ctx: TaskContext): void;
}
