// All-camelCase, including table names - paired with kysely's CamelCasePlugin
// (see resolve.ts), which transforms every identifier here to snake_case for
// the real SQL sent to the database (relayosExecutions -> relayos_executions).
export interface RelayosExecutionsTable {
  id: string;
  eventId: string;
  eventType: string;
  eventData: unknown; // always JSON.stringify'd on write - see coerce.ts
  status: string;
  attempt: number;
  replayedFrom: string | null;
  createdAt: unknown; // ISO string (postgres/sqlite) or Date (mysql) - see coerce.ts
  completedAt: unknown | null;
  error: string | null;
}

export interface RelayosExecutionStepsTable {
  id: string;
  executionId: string;
  name: string;
  status: string;
  output: unknown | null;
  error: string | null;
  createdAt: unknown;
}

export interface RelayosExecutionLogsTable {
  id: string;
  executionId: string;
  level: string;
  source: string;
  message: string;
  data: unknown | null;
  createdAt: unknown;
}

export interface Database {
  relayosExecutions: RelayosExecutionsTable;
  relayosExecutionSteps: RelayosExecutionStepsTable;
  relayosExecutionLogs: RelayosExecutionLogsTable;
}
