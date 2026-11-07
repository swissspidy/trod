import type { Task } from '../lib/types.ts';
import apiQuery from './api-query.ts';
import browserCheck from './browser-check.ts';
import bulkRefactor from './bulk-refactor.ts';
import configMigrate from './config-migrate.ts';
import controlBugfix from './control-bugfix.ts';
import controlQuestion from './control-question.ts';
import codeQa from './code-qa.ts';
import inventoryApi from './inventory-api.ts';
import csvClean from './csv-clean.ts';
import logAnalysis from './log-analysis.ts';
import mdLinks from './md-links.ts';
import pageAudit from './page-audit.ts';
import ticketTriage from './ticket-triage.ts';

export const TASKS: Task[] = [
  pageAudit,
  csvClean,
  bulkRefactor,
  apiQuery,
  browserCheck,
  logAnalysis,
  mdLinks,
  configMigrate,
  controlBugfix,
  controlQuestion,
  // Round 2: per-item reasoning on top of fiddly, repeated lookups.
  codeQa,
  ticketTriage,
  // Round 3: hard-won knowledge across fresh sessions (--mode sessions).
  inventoryApi,
];
