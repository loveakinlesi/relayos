# Multi-Dialect Storage Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@relayos/postgres` (Drizzle, Postgres-only, requires a separate `createPostgresExecutionStore()` call) with database support built directly into `@relayos/core`: pass a raw `pg.Pool`, `better-sqlite3.Database`, or `mysql2.Pool` straight into `relayos({ database })` and it auto-detects the dialect and just works, backed by Kysely instead of Drizzle. Drop the in-memory store as a production/documented option. Add lightweight versioned migrations that auto-run in dev and via an explicit `relay.migrate()` call in production.

**Architecture:** `@relayos/core` gains an internal `src/db/` module: dialect detection (duck-typing on the client shape), a Kysely-backed `ExecutionStore` implementation shared across postgres/sqlite/mysql, and a hand-written versioned migration runner. `RelayConfig.database` becomes a union type (`ExecutionStore | PostgresPool | SqliteDatabase | MysqlPool | { dialect: Dialect }`) resolved once at `relayos()` construction time via a new `resolveDatabase()` function. No new package and no new subpath export are needed — Kysely's dialect classes never import the underlying driver packages at runtime (verified: `PostgresDialect`/`SqliteDialect`/`MysqlDialect`'s driver source only imports Kysely's own internal modules), so `@relayos/core`'s single entry point can safely depend on `kysely` without forcing `pg`/`better-sqlite3`/`mysql2` on every consumer.

**Tech Stack:** Kysely 0.29.x (query builder, no ORM/schema-codegen), `kysely`'s built-in `CamelCasePlugin` (so store code and the `Database` interface use the same camelCase names as our domain types — no manual snake_case↔camelCase mapping), `@testcontainers/postgresql` + `@testcontainers/mysql` for dialect integration tests, `better-sqlite3` in `:memory:` mode for fast sqlite tests.

## Global Constraints

- No published npm versions exist yet for any `@relayos/*` package or `relayos` (verified via `npm view` — all 404) — this is a breaking redesign with zero backward-compatibility burden. Don't add deprecation shims or dual code paths.
- Table names are prefixed (`relayosExecutions`, `relayosExecutionSteps`, `relayosExecutionLogs` in TypeScript; `relayos_executions`, `relayos_execution_steps`, `relayos_execution_logs` in real SQL after the `CamelCasePlugin` transform) instead of Postgres's current dedicated `relayos` schema — MySQL and SQLite have no equivalent namespacing mechanism, so this is the one scheme that works identically across all three dialects.
- `RelayConfig.database` is **required** (no `?`) — there is no sensible zero-config default once the in-memory store is gone.
- Migration DDL is hand-written raw SQL per dialect (via Kysely's `sql` tagged template), not Kysely's schema-builder API — full control over dialect-specific column types (`jsonb` vs `json` vs `text`, `timestamptz` vs `datetime(3)` vs `text`) matters more here than schema-builder portability.
- Migrations run through a **separate, plugin-free** `Kysely<any>` instance using literal snake_case identifiers — Kysely's own convention: migration history must stay stable even if the app's query-side plugin config changes later.
- JSON columns are always written via `JSON.stringify` and read via a `typeof value === 'string' ? JSON.parse(value) : value` guard, uniformly across all three dialects — this sidesteps needing to know whether a given driver auto-parses `jsonb`/`JSON` columns (Postgres's `pg` driver does; sqlite/mysql behavior isn't relied upon either way).
- Timestamps are written as an ISO string for postgres/sqlite and a `Date` object for mysql (`mysql2` needs a `Date` for its `datetime` binding — verified this is exactly what the `timezone: 'Z'` option in mysql2 pool config is for), and read back via `value instanceof Date ? value.toISOString() : String(value)`.
- Dialect detection is duck-typing against Kysely's own exported structural types (`SqliteDatabase` has `.prepare`, `MysqlPool` has `.getConnection`, `PostgresPool` is the fallback) — these are the exact minimal interfaces Kysely's own dialect classes require, confirmed directly from the installed `kysely` package's `.d.ts` files, not guessed.
- Use plain `mysql2`'s `createPool()` (callback-style), **not** `mysql2/promise` — Kysely's `MysqlPool` interface requires `getConnection(callback)`, which is the callback-based pool's shape, not the promise-wrapped one.

---

### Task 1: Add Kysely and driver dependencies to `@relayos/core`

**Files:**

- Modify: `packages/core/package.json`

**Interfaces:**

- Produces: `kysely` importable from `@relayos/core`'s source going forward; `better-sqlite3`, `pg`, `mysql2` available as devDependencies for tests (never imported by shipped runtime code — those stay peer-optional for consumers).

- [ ] **Step 1: Add dependencies**

Edit `packages/core/package.json`, adding a `"dependencies"` block (it doesn't currently have one) and expanding `devDependencies`:

```json
  "dependencies": {
    "kysely": "^0.29.3"
  },
  "devDependencies": {
    "@testcontainers/mysql": "^12.0.4",
    "@testcontainers/postgresql": "^12.0.4",
    "@types/better-sqlite3": "^7.6.13",
    "@types/pg": "^8.11.0",
    "better-sqlite3": "^12.11.1",
    "mysql2": "^3.22.6",
    "pg": "^8.13.0",
    "rimraf": "^6.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0",
    "vitest": "^4.1.7"
  },
```

- [ ] **Step 2: Install**

Run: `cd packages/core && pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml
git commit -m "chore(core): add kysely and test-only driver dependencies"
```

---

### Task 2: Dialect detection

**Files:**

- Create: `packages/core/src/db/detect.ts`
- Test: `packages/core/src/db/detect.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `type SqlDialectName = 'postgres' | 'sqlite' | 'mysql'`, `type RawSqlClient = PostgresPool | SqliteDatabase | MysqlPool` (re-exported from `kysely`), `detectDialectName(client: RawSqlClient): SqlDialectName`, `buildDialect(client: RawSqlClient): { dialect: Dialect; name: SqlDialectName }` — all consumed by Task 6's `resolveDatabase()`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/db/detect.test.ts
import { describe, it, expect } from 'vitest';
import { detectDialectName, type RawSqlClient } from './detect';

describe('detectDialectName', () => {
  it('detects sqlite from a .prepare()/.close() shaped client', () => {
    const client = { prepare: () => ({}), close: () => {} } as unknown as RawSqlClient;
    expect(detectDialectName(client)).toBe('sqlite');
  });

  it('detects mysql from a .getConnection() shaped client', () => {
    const client = { getConnection: () => {}, end: () => {} } as unknown as RawSqlClient;
    expect(detectDialectName(client)).toBe('mysql');
  });

  it('falls back to postgres for a .connect()/.end() shaped client', () => {
    const client = {
      connect: async () => ({}),
      end: async () => {},
      options: {},
    } as unknown as RawSqlClient;
    expect(detectDialectName(client)).toBe('postgres');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test detect`
Expected: FAIL - `Cannot find module './detect'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/db/detect.ts
import { MysqlDialect, PostgresDialect, SqliteDialect } from 'kysely';
import type { Dialect, MysqlPool, PostgresPool, SqliteDatabase } from 'kysely';

export type SqlDialectName = 'postgres' | 'sqlite' | 'mysql';
export type RawSqlClient = PostgresPool | SqliteDatabase | MysqlPool;

/**
 * Duck-typed against Kysely's own minimal structural interfaces for each
 * driver (SqliteDatabase/MysqlPool/PostgresPool) - these are exactly the
 * shapes Kysely's dialect classes require, not a guess at the real driver's
 * full API.
 */
export function isSqliteDatabase(client: RawSqlClient): client is SqliteDatabase {
  return typeof (client as Partial<SqliteDatabase>).prepare === 'function';
}

export function isMysqlPool(client: RawSqlClient): client is MysqlPool {
  return typeof (client as Partial<MysqlPool>).getConnection === 'function';
}

export function detectDialectName(client: RawSqlClient): SqlDialectName {
  if (isSqliteDatabase(client)) return 'sqlite';
  if (isMysqlPool(client)) return 'mysql';
  return 'postgres';
}

export function buildDialect(client: RawSqlClient): { dialect: Dialect; name: SqlDialectName } {
  const name = detectDialectName(client);
  if (name === 'sqlite') {
    return { dialect: new SqliteDialect({ database: client as SqliteDatabase }), name };
  }
  if (name === 'mysql') {
    return { dialect: new MysqlDialect({ pool: client as MysqlPool }), name };
  }
  return { dialect: new PostgresDialect({ pool: client as PostgresPool }), name };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test detect`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/detect.ts packages/core/src/db/detect.test.ts
git commit -m "feat(core): duck-type dialect detection for postgres/sqlite/mysql clients"
```

---

### Task 3: Kysely schema types and value coercion helpers

**Files:**

- Create: `packages/core/src/db/schema.ts`
- Create: `packages/core/src/db/coerce.ts`
- Test: `packages/core/src/db/coerce.test.ts`

**Interfaces:**

- Consumes: `SqlDialectName` from Task 2.
- Produces: `interface Database { relayosExecutions; relayosExecutionSteps; relayosExecutionLogs }` (Kysely schema, camelCase keys), `toJson(value: unknown): string`, `fromJson(raw: unknown): unknown`, `toTimestamp(iso: string, dialect: SqlDialectName): string | Date`, `fromTimestamp(raw: unknown): string` — all consumed by Task 5's store implementation.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/db/coerce.test.ts
import { describe, it, expect } from 'vitest';
import { fromJson, fromTimestamp, toJson, toTimestamp } from './coerce';

describe('toJson / fromJson', () => {
  it('round-trips a plain object through a JSON string', () => {
    const value = { foo: 'bar', n: 1 };
    expect(fromJson(toJson(value))).toEqual(value);
  });

  it('fromJson passes through an already-parsed object unchanged', () => {
    const value = { foo: 'bar' };
    expect(fromJson(value)).toBe(value);
  });
});

describe('toTimestamp / fromTimestamp', () => {
  const iso = '2026-07-12T21:00:00.000Z';

  it('mysql gets a Date, postgres and sqlite get the ISO string back', () => {
    expect(toTimestamp(iso, 'mysql')).toBeInstanceOf(Date);
    expect(toTimestamp(iso, 'postgres')).toBe(iso);
    expect(toTimestamp(iso, 'sqlite')).toBe(iso);
  });

  it('fromTimestamp normalizes a Date back to an ISO string', () => {
    expect(fromTimestamp(new Date(iso))).toBe(iso);
  });

  it('fromTimestamp passes an already-string value through', () => {
    expect(fromTimestamp(iso)).toBe(iso);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test coerce`
Expected: FAIL - `Cannot find module './coerce'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/db/coerce.ts
import type { SqlDialectName } from './detect';

export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

export function fromJson(raw: unknown): unknown {
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

export function toTimestamp(iso: string, dialect: SqlDialectName): string | Date {
  return dialect === 'mysql' ? new Date(iso) : iso;
}

export function fromTimestamp(raw: unknown): string {
  return raw instanceof Date ? raw.toISOString() : String(raw);
}
```

```ts
// packages/core/src/db/schema.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test coerce`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/schema.ts packages/core/src/db/coerce.ts packages/core/src/db/coerce.test.ts
git commit -m "feat(core): kysely schema types and cross-dialect value coercion"
```

---

### Task 4: Versioned migration runner

**Files:**

- Create: `packages/core/src/db/migrations/001-initial.ts`
- Create: `packages/core/src/db/migrate.ts`
- Test: `packages/core/src/db/migrate.test.ts`

**Interfaces:**

- Consumes: `SqlDialectName` from Task 2.
- Produces: `migrateToLatest(db: Kysely<any>, dialect: SqlDialectName): Promise<void>` — consumed by Task 6's `resolveDatabase()` (and, transitively, by `relay.migrate()` in Task 7, and the CLI plan's `relay migrate` command).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/db/migrate.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, sql } from 'kysely';
import { migrateToLatest } from './migrate';

describe('migrateToLatest (sqlite)', () => {
  let db: Kysely<any> | undefined;

  afterEach(async () => {
    await db?.destroy();
  });

  it('creates the three relayos tables', async () => {
    db = new Kysely({ dialect: new SqliteDialect({ database: new Database(':memory:') }) });
    await migrateToLatest(db, 'sqlite');

    const tables = await sql<{ name: string }>`
      select name from sqlite_master where type = 'table' and name like 'relayos_%'
    `.execute(db);
    const names = tables.rows.map((row) => row.name).sort();
    expect(names).toEqual([
      'relayos_execution_logs',
      'relayos_execution_steps',
      'relayos_executions',
      'relayos_migrations',
    ]);
  });

  it('records the migration name in relayos_migrations', async () => {
    db = new Kysely({ dialect: new SqliteDialect({ database: new Database(':memory:') }) });
    await migrateToLatest(db, 'sqlite');

    const applied = await db.selectFrom('relayos_migrations').select('name').execute();
    expect(applied.map((row) => row.name)).toEqual(['001_initial']);
  });

  it('is idempotent - running it twice does not error or duplicate the tracking row', async () => {
    db = new Kysely({ dialect: new SqliteDialect({ database: new Database(':memory:') }) });
    await migrateToLatest(db, 'sqlite');
    await expect(migrateToLatest(db, 'sqlite')).resolves.not.toThrow();

    const applied = await db.selectFrom('relayos_migrations').select('name').execute();
    expect(applied).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test migrate`
Expected: FAIL - `Cannot find module './migrate'`

- [ ] **Step 3: Write the migration definition**

```ts
// packages/core/src/db/migrations/001-initial.ts
import { sql, type Kysely } from 'kysely';
import type { SqlDialectName } from '../detect';

export const name = '001_initial';

export async function up(db: Kysely<any>, dialect: SqlDialectName): Promise<void> {
  if (dialect === 'postgres') {
    await sql`
      create table if not exists relayos_executions (
        id text primary key,
        event_id text not null unique,
        event_type text not null,
        event_data jsonb not null,
        status text not null,
        attempt integer not null default 1,
        replayed_from text,
        created_at timestamptz not null,
        completed_at timestamptz,
        error text
      )
    `.execute(db);
    await sql`
      create table if not exists relayos_execution_steps (
        id text primary key,
        execution_id text not null references relayos_executions(id),
        name text not null,
        status text not null,
        output jsonb,
        error text,
        created_at timestamptz not null
      )
    `.execute(db);
    await sql`
      create table if not exists relayos_execution_logs (
        id text primary key,
        execution_id text not null references relayos_executions(id),
        level text not null,
        source text not null,
        message text not null,
        data jsonb,
        created_at timestamptz not null
      )
    `.execute(db);
    return;
  }

  if (dialect === 'mysql') {
    await sql`
      create table if not exists relayos_executions (
        id varchar(36) primary key,
        event_id varchar(255) not null unique,
        event_type varchar(255) not null,
        event_data json not null,
        status varchar(32) not null,
        attempt integer not null default 1,
        replayed_from varchar(36),
        created_at datetime(3) not null,
        completed_at datetime(3),
        error text
      )
    `.execute(db);
    await sql`
      create table if not exists relayos_execution_steps (
        id varchar(36) primary key,
        execution_id varchar(36) not null,
        name varchar(255) not null,
        status varchar(32) not null,
        output json,
        error text,
        created_at datetime(3) not null,
        foreign key (execution_id) references relayos_executions(id)
      )
    `.execute(db);
    await sql`
      create table if not exists relayos_execution_logs (
        id varchar(36) primary key,
        execution_id varchar(36) not null,
        level varchar(32) not null,
        source varchar(32) not null,
        message text not null,
        data json,
        created_at datetime(3) not null,
        foreign key (execution_id) references relayos_executions(id)
      )
    `.execute(db);
    return;
  }

  // sqlite
  await sql`
    create table if not exists relayos_executions (
      id text primary key,
      event_id text not null unique,
      event_type text not null,
      event_data text not null,
      status text not null,
      attempt integer not null default 1,
      replayed_from text,
      created_at text not null,
      completed_at text,
      error text
    )
  `.execute(db);
  await sql`
    create table if not exists relayos_execution_steps (
      id text primary key,
      execution_id text not null references relayos_executions(id),
      name text not null,
      status text not null,
      output text,
      error text,
      created_at text not null
    )
  `.execute(db);
  await sql`
    create table if not exists relayos_execution_logs (
      id text primary key,
      execution_id text not null references relayos_executions(id),
      level text not null,
      source text not null,
      message text not null,
      data text,
      created_at text not null
    )
  `.execute(db);
}
```

- [ ] **Step 4: Write the migration runner**

```ts
// packages/core/src/db/migrate.ts
import { sql, type Kysely } from 'kysely';
import type { SqlDialectName } from './detect';
import * as initial from './migrations/001-initial';

const migrations = [initial];

async function ensureMigrationsTable(db: Kysely<any>, dialect: SqlDialectName): Promise<void> {
  const nameType = dialect === 'mysql' ? sql.raw('varchar(255)') : sql.raw('text');
  const timestampType =
    dialect === 'postgres'
      ? sql.raw('timestamptz')
      : dialect === 'mysql'
        ? sql.raw('datetime(3)')
        : sql.raw('text');

  await sql`
    create table if not exists relayos_migrations (
      name ${nameType} primary key,
      executed_at ${timestampType} not null
    )
  `.execute(db);
}

/**
 * Applies every not-yet-applied migration in order, tracked in
 * relayos_migrations. Postgres and sqlite wrap each migration's DDL and its
 * tracking-row insert in one transaction. MySQL can't: CREATE TABLE causes
 * an implicit commit there, so the DDL and the tracking insert run as two
 * sequential statements instead - not atomic, but each migration's DDL is
 * itself idempotent ("if not exists"), so a crash between the two just means
 * the next run re-applies the (no-op) DDL and then records it.
 */
export async function migrateToLatest(db: Kysely<any>, dialect: SqlDialectName): Promise<void> {
  await ensureMigrationsTable(db, dialect);

  for (const migration of migrations) {
    const applied = await db
      .selectFrom('relayos_migrations')
      .select('name')
      .where('name', '=', migration.name)
      .executeTakeFirst();
    if (applied) continue;

    if (dialect === 'mysql') {
      await migration.up(db, dialect);
      await db
        .insertInto('relayos_migrations')
        .values({ name: migration.name, executed_at: new Date() })
        .execute();
      continue;
    }

    await db.transaction().execute(async (trx) => {
      await migration.up(trx, dialect);
      await trx
        .insertInto('relayos_migrations')
        .values({
          name: migration.name,
          executed_at: dialect === 'sqlite' ? new Date().toISOString() : new Date(),
        })
        .execute();
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test migrate`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/db/migrations packages/core/src/db/migrate.ts packages/core/src/db/migrate.test.ts
git commit -m "feat(core): versioned, idempotent SQL migrations for postgres/sqlite/mysql"
```

---

### Task 5: Kysely-backed ExecutionStore

**Files:**

- Create: `packages/core/src/db/store.ts`

**Interfaces:**

- Consumes: `Database` schema from Task 3, `toJson`/`fromJson`/`toTimestamp`/`fromTimestamp` from Task 3, `SqlDialectName` from Task 2, `ExecutionStore`/`Execution`/`ExecutionStep`/`ExecutionLog`/`ExecutionStatus`/`StepStatus`/`LogLevel`/`LogSource` from `../types`.
- Produces: `createSqlExecutionStore(db: Kysely<Database>, dialect: SqlDialectName): ExecutionStore` — consumed by Task 6's `resolveDatabase()` and exercised directly by Task 8's contract test suite.

No standalone test in this task - `createSqlExecutionStore` is exercised by the parametrized contract suite in Task 8, which is where its correctness (including the postgres/sqlite vs. mysql `create()` split) actually gets proven against real dialects. Writing dialect-specific unit tests here would just duplicate Task 8's assertions against a single hand-mocked `Kysely` object, which proves nothing about real SQL behavior.

- [ ] **Step 1: Write the implementation**

```ts
// packages/core/src/db/store.ts
import type { Kysely } from 'kysely';
import type {
  Execution,
  ExecutionLog,
  ExecutionStatus,
  ExecutionStep,
  ExecutionStore,
  LogLevel,
  LogSource,
  StepStatus,
} from '../types';
import type {
  Database,
  RelayosExecutionLogsTable,
  RelayosExecutionsTable,
  RelayosExecutionStepsTable,
} from './schema';
import type { SqlDialectName } from './detect';
import { fromJson, fromTimestamp, toJson, toTimestamp } from './coerce';

function toExecution(row: RelayosExecutionsTable & { id: string }): Execution {
  return {
    id: row.id,
    eventId: row.eventId,
    eventType: row.eventType,
    eventData: fromJson(row.eventData) as Record<string, unknown>,
    status: row.status as ExecutionStatus,
    attempt: row.attempt,
    replayedFrom: row.replayedFrom ?? undefined,
    createdAt: fromTimestamp(row.createdAt),
    completedAt: row.completedAt != null ? fromTimestamp(row.completedAt) : undefined,
    error: row.error ?? undefined,
  };
}

function toStep(row: RelayosExecutionStepsTable & { id: string }): ExecutionStep {
  return {
    id: row.id,
    executionId: row.executionId,
    name: row.name,
    status: row.status as StepStatus,
    output: row.output != null ? fromJson(row.output) : undefined,
    error: row.error ?? undefined,
    createdAt: fromTimestamp(row.createdAt),
  };
}

function toLog(row: RelayosExecutionLogsTable & { id: string }): ExecutionLog {
  return {
    id: row.id,
    executionId: row.executionId,
    level: row.level as LogLevel,
    source: row.source as LogSource,
    message: row.message,
    data: row.data != null ? fromJson(row.data) : undefined,
    createdAt: fromTimestamp(row.createdAt),
  };
}

export function createSqlExecutionStore(
  db: Kysely<Database>,
  dialect: SqlDialectName,
): ExecutionStore {
  return {
    async create(execution) {
      const values = {
        id: execution.id,
        eventId: execution.eventId,
        eventType: execution.eventType,
        eventData: toJson(execution.eventData),
        status: execution.status,
        attempt: execution.attempt,
        replayedFrom: execution.replayedFrom ?? null,
        createdAt: toTimestamp(execution.createdAt, dialect),
        completedAt: execution.completedAt ? toTimestamp(execution.completedAt, dialect) : null,
        error: execution.error ?? null,
      };

      if (dialect === 'mysql') {
        // MySQL has no RETURNING clause, so create()'s "did this call win
        // the insert race" contract is read off the affected-row count of
        // an `insert ignore` instead of a returned row.
        const result = await db
          .insertInto('relayosExecutions')
          .values(values)
          .ignore()
          .executeTakeFirst();
        return (result.numInsertedOrUpdatedRows ?? 0n) > 0n;
      }

      const row = await db
        .insertInto('relayosExecutions')
        .values(values)
        .onConflict((oc) => oc.column('eventId').doNothing())
        .returning('id')
        .executeTakeFirst();
      return row !== undefined;
    },

    async update(id, patch) {
      const values: Record<string, unknown> = {};
      if (patch.status !== undefined) values['status'] = patch.status;
      if (patch.attempt !== undefined) values['attempt'] = patch.attempt;
      if ('completedAt' in patch) {
        values['completedAt'] = patch.completedAt ? toTimestamp(patch.completedAt, dialect) : null;
      }
      if ('error' in patch) values['error'] = patch.error ?? null;
      if (Object.keys(values).length === 0) return;

      await db.updateTable('relayosExecutions').set(values).where('id', '=', id).execute();
    },

    async list() {
      const rows = await db
        .selectFrom('relayosExecutions')
        .selectAll()
        .orderBy('createdAt', 'desc')
        .execute();
      return rows.map(toExecution);
    },

    async get(id) {
      const row = await db
        .selectFrom('relayosExecutions')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row ? toExecution(row) : undefined;
    },

    async findByEventId(eventId) {
      const row = await db
        .selectFrom('relayosExecutions')
        .selectAll()
        .where('eventId', '=', eventId)
        .executeTakeFirst();
      return row ? toExecution(row) : undefined;
    },

    async getStep(executionId, name) {
      const row = await db
        .selectFrom('relayosExecutionSteps')
        .selectAll()
        .where('executionId', '=', executionId)
        .where('name', '=', name)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst();
      return row ? toStep(row) : undefined;
    },

    async saveStep(step) {
      await db
        .insertInto('relayosExecutionSteps')
        .values({
          id: step.id,
          executionId: step.executionId,
          name: step.name,
          status: step.status,
          output: step.output !== undefined ? toJson(step.output) : null,
          error: step.error ?? null,
          createdAt: toTimestamp(step.createdAt, dialect),
        })
        .execute();
    },

    async listSteps(executionId) {
      const rows = await db
        .selectFrom('relayosExecutionSteps')
        .selectAll()
        .where('executionId', '=', executionId)
        .orderBy('createdAt', 'asc')
        .execute();
      return rows.map(toStep);
    },

    async saveLog(log) {
      await db
        .insertInto('relayosExecutionLogs')
        .values({
          id: log.id,
          executionId: log.executionId,
          level: log.level,
          source: log.source,
          message: log.message,
          data: log.data !== undefined ? toJson(log.data) : null,
          createdAt: toTimestamp(log.createdAt, dialect),
        })
        .execute();
    },

    async listLogs(executionId) {
      const rows = await db
        .selectFrom('relayosExecutionLogs')
        .selectAll()
        .where('executionId', '=', executionId)
        .orderBy('createdAt', 'asc')
        .execute();
      return rows.map(toLog);
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/core && pnpm lint`
Expected: no errors (this task has no runtime test of its own - Task 8 exercises it against real databases).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/db/store.ts
git commit -m "feat(core): kysely-backed ExecutionStore shared across postgres/sqlite/mysql"
```

---

### Task 6: `resolveDatabase()` — normalize `RelayConfig.database` into a store

**Files:**

- Create: `packages/core/src/db/resolve.ts`
- Test: `packages/core/src/db/resolve.test.ts`
- Modify: `packages/core/src/types.ts`

**Interfaces:**

- Consumes: `buildDialect`/`RawSqlClient` from Task 2, `Database` schema from Task 3, `migrateToLatest` from Task 4, `createSqlExecutionStore` from Task 5, `ExecutionStore` from `./types`.
- Produces: `type RelayDatabaseConfig = ExecutionStore | RawSqlClient | { dialect: Dialect }`, `resolveDatabase(config: RelayDatabaseConfig): { store: ExecutionStore; migrate: () => Promise<void> }` — consumed by Task 7's `engine.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/db/resolve.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteDialect } from 'kysely';
import type { ExecutionStore } from '../types';
import { resolveDatabase } from './resolve';

describe('resolveDatabase', () => {
  it('wraps a raw sqlite client in a Kysely-backed store and can migrate it', async () => {
    const client = new Database(':memory:');
    const { store, migrate } = resolveDatabase(client);

    await migrate();
    const created = await store.create({
      id: '1',
      eventId: 'evt-1',
      eventType: 't',
      eventData: {},
      status: 'pending',
      attempt: 1,
      createdAt: new Date().toISOString(),
    });
    expect(created).toBe(true);
  });

  it('passes a plain ExecutionStore through unchanged, with a no-op migrate()', async () => {
    const custom: ExecutionStore = {
      create: async () => true,
      update: async () => {},
      list: async () => [],
      get: async () => undefined,
      findByEventId: async () => undefined,
      getStep: async () => undefined,
      saveStep: async () => {},
      listSteps: async () => [],
      saveLog: async () => {},
      listLogs: async () => [],
    };

    const { store, migrate } = resolveDatabase(custom);
    expect(store).toBe(custom);
    await expect(migrate()).resolves.toBeUndefined();
  });

  it('accepts the { dialect } escape hatch and no-ops migrate() with a warning', async () => {
    const client = new Database(':memory:');
    const { migrate } = resolveDatabase({ dialect: new SqliteDialect({ database: client }) });
    await expect(migrate()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test resolve`
Expected: FAIL - `Cannot find module './resolve'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/db/resolve.ts
import { CamelCasePlugin, Kysely } from 'kysely';
import type { Dialect } from 'kysely';
import type { ExecutionStore } from '../types';
import type { Database } from './schema';
import { buildDialect, type RawSqlClient } from './detect';
import { createSqlExecutionStore } from './store';
import { migrateToLatest } from './migrate';

export type RelayDatabaseConfig = ExecutionStore | RawSqlClient | { dialect: Dialect };

function isExecutionStore(value: object): value is ExecutionStore {
  return (
    typeof (value as Partial<ExecutionStore>).create === 'function' &&
    typeof (value as Partial<ExecutionStore>).findByEventId === 'function'
  );
}

function isDialectEscapeHatch(value: object): value is { dialect: Dialect } {
  return 'dialect' in value && typeof (value as { dialect?: unknown }).dialect === 'object';
}

export function resolveDatabase(config: RelayDatabaseConfig): {
  store: ExecutionStore;
  migrate: () => Promise<void>;
} {
  if (isExecutionStore(config)) {
    return { store: config, migrate: async () => {} };
  }

  const escapeHatch = isDialectEscapeHatch(config);
  const { dialect, name } = escapeHatch
    ? { dialect: config.dialect, name: undefined }
    : buildDialect(config);

  const db = new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] });
  const store = createSqlExecutionStore(db, name ?? 'postgres');

  return {
    store,
    async migrate() {
      if (!name) {
        console.warn(
          '[relayos] migrate(): no built-in migrations for a custom Kysely dialect - manage your own schema.',
        );
        return;
      }
      const rawDb = new Kysely<any>({ dialect });
      await migrateToLatest(rawDb, name);
      await rawDb.destroy();
    },
  };
}
```

- [ ] **Step 4: Update `RelayConfig.database`'s type**

In `packages/core/src/types.ts`, add the import and change the `database` field on `RelayConfig`:

```ts
import type { RelayDatabaseConfig } from './db/resolve';
```

```ts
export type RelayConfig<
  TPlugins extends readonly RelayPlugin<any>[] = readonly RelayPlugin<any>[],
> = {
  database: RelayDatabaseConfig;
  plugins?: TPlugins;
  retry?: RetryPolicy;
  maxRequestBodyBytes?: number;
};
```

(This replaces the old `database?: ExecutionStore;` line.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test resolve`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/db/resolve.ts packages/core/src/db/resolve.test.ts packages/core/src/types.ts
git commit -m "feat(core): resolveDatabase() normalizes raw clients, custom stores, and dialect escape hatches"
```

---

### Task 7: Wire into the engine — required database, `relay.migrate()`, lazy dev auto-migrate, remove the in-memory default

**Files:**

- Modify: `packages/core/src/engine.ts`
- Modify: `packages/core/src/types.ts` (add `migrate` to `Relay`)
- Create: `packages/core/src/test/memory-store.ts` (moved, private test helper - not exported from the package)
- Delete: `packages/core/src/memory-store.ts`
- Delete: `packages/core/src/memory-store.test.ts`
- Modify: `packages/core/src/index.ts` (remove the `createMemoryExecutionStore` export)
- Modify: `packages/core/src/engine.test.ts` (18 call sites now need an explicit `database`)
- Modify: `packages/relayos/src/index.ts` (remove the re-export, update the JSDoc)
- Modify: `packages/relayos/src/index.test.ts` (uses the memory store as its default too)

**Interfaces:**

- Consumes: `resolveDatabase` from Task 6.
- Produces: `Relay.migrate(): Promise<void>` (new public method) — consumed by the CLI plan's `migrate`/`dev` commands.

- [ ] **Step 1: Move the in-memory store to a private test helper**

The in-memory store is genuinely useful for testing engine orchestration logic (retry timing, step caching, handler dispatch) in isolation from a real database - but it must not be reachable as a production `database` option anymore, per the "can't take it to production" reasoning. Move it, unexported, into a test-only location:

```bash
mkdir -p packages/core/src/test
git mv packages/core/src/memory-store.ts packages/core/src/test/memory-store.ts
git rm packages/core/src/memory-store.test.ts
```

Update the moved file's import path (it imports from `../types`, now needs `../../types`):

In `packages/core/src/test/memory-store.ts`, change:

```ts
import type { Execution, ExecutionLog, ExecutionStep, ExecutionStore } from './types';
```

to:

```ts
import type { Execution, ExecutionLog, ExecutionStep, ExecutionStore } from '../types';
```

- [ ] **Step 2: Remove the public export**

In `packages/core/src/index.ts`, delete this line:

```ts
export { createMemoryExecutionStore } from './memory-store';
```

In `packages/relayos/src/index.ts`, delete:

```ts
export { createMemoryExecutionStore } from '@relayos/core';
```

- [ ] **Step 3: Add `migrate` to the `Relay` type**

In `packages/core/src/types.ts`, add to the `Relay` type (after `handler`):

```ts
export type Relay<TEventMap extends Record<string, unknown> = {}> = {
  // ... existing members unchanged ...
  /** Applies any pending schema migrations. Auto-runs once, lazily, outside
   *  production; call explicitly in production before scaling up instances. */
  migrate: () => Promise<void>;
  handler: (req: Request, ctx: RelayHandlerContext) => Promise<Response>;
};
```

- [ ] **Step 4: Wire `resolveDatabase()` and lazy migration into the engine**

In `packages/core/src/engine.ts`, replace:

```ts
import { createMemoryExecutionStore } from './memory-store';
```

with:

```ts
import { resolveDatabase } from './db/resolve';
```

Replace:

```ts
const store = config.database ?? createMemoryExecutionStore();
```

with:

```ts
const { store, migrate } = resolveDatabase(config.database);

let migrated: Promise<void> | undefined;
function ensureMigrated(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') return Promise.resolve();
  if (!migrated) migrated = migrate();
  return migrated;
}
```

Add `await ensureMigrated();` as the first line of the body of `ingest`, `retryExecution`'s `runExclusive` callback, `restartExecution`'s `runExclusive` callback, and `replayExecution` - and add three trivial pass-through methods. Concretely:

- In `async function ingest(event)`, add `await ensureMigrated();` as the very first line.
- In `async function retryExecution(executionId, reason)`, add `await ensureMigrated();` as the first line, before `return runExclusive(...)`.
- In `async function restartExecution(executionId)`, add `await ensureMigrated();` as the first line, before `return runExclusive(...)`.
- In `async function replayExecution(executionId)`, add `await ensureMigrated();` as the first line.

In the `relay` object literal at the bottom of `createRelayEngine`, add, alongside `listExecutions`/`listSteps`/`listLogs`:

```ts
    async listExecutions() {
      await ensureMigrated();
      return store.list();
    },
    async listSteps(executionId) {
      await ensureMigrated();
      return store.listSteps(executionId);
    },
    async listLogs(executionId) {
      await ensureMigrated();
      return store.listLogs(executionId);
    },
    migrate,
```

(Replacing the existing non-async `listExecutions`/`listSteps`/`listLogs` implementations - they now await the migration guard before delegating to `store`.)

- [ ] **Step 5: Update `engine.test.ts`'s 18 call sites**

At the top of `packages/core/src/engine.test.ts`, add the import:

```ts
import { createMemoryExecutionStore } from './test/memory-store';
```

Every `createRelayEngine(...)` and `createRelayEngine({...})` call in this file must now pass an explicit `database`. For calls with no config object (`createRelayEngine()`), change to:

```ts
createRelayEngine({ database: createMemoryExecutionStore() });
```

For calls that already pass a config object (e.g. `createRelayEngine({ retry: noAutoRetry })`), add the field:

```ts
createRelayEngine({ database: createMemoryExecutionStore(), retry: noAutoRetry });
```

Apply this to all 18 call sites (lines 46, 57, 63, 76, 88, 100, 129, 144, 165, 194, 217, 236, 251, 258, 274, 297, 305, 321 as of this writing - search for `createRelayEngine(` to catch all of them, since line numbers will shift as edits are made).

- [ ] **Step 6: Update `packages/relayos/src/index.test.ts`**

This file's "processes an event end-to-end on the default memory store" test relied on the in-memory default. Update it to pass an explicit store and adjust the test name/comment - it's no longer a "default":

```ts
import { createMemoryExecutionStore } from '@relayos/core/test/memory-store';
```

Wait - `@relayos/core/test/memory-store` is not a published subpath. Instead, since this SDK-surface test only needs _some_ working store to prove `relayos()` end-to-end, construct a tiny inline fake store directly in the test rather than reaching into core's private test helper:

```ts
function createFakeStore(): ExecutionStore {
  const executions = new Map<string, Execution>();
  return {
    async create(execution) {
      if (Array.from(executions.values()).some((e) => e.eventId === execution.eventId))
        return false;
      executions.set(execution.id, execution);
      return true;
    },
    async update(id, patch) {
      const existing = executions.get(id);
      if (existing) executions.set(id, { ...existing, ...patch });
    },
    async list() {
      return Array.from(executions.values());
    },
    async get(id) {
      return executions.get(id);
    },
    async findByEventId(eventId) {
      return Array.from(executions.values()).find((e) => e.eventId === eventId);
    },
    async getStep() {
      return undefined;
    },
    async saveStep() {},
    async listSteps() {
      return [];
    },
    async saveLog() {},
    async listLogs() {
      return [];
    },
  };
}
```

Update the test title from `'processes an event end-to-end on the default memory store'` to `'processes an event end-to-end against a custom ExecutionStore'`, and pass `database: createFakeStore()` in its `relayos({...})` call. Remove the `createMemoryExecutionStore` import and its `PublicSurface` reference (it's no longer part of the public surface).

- [ ] **Step 7: Run the full core and relayos test suites**

Run: `cd packages/core && pnpm test && cd ../relayos && pnpm test`
Expected: All tests PASS.

- [ ] **Step 8: Run lint across both packages**

Run: `cd packages/core && pnpm lint && cd ../relayos && pnpm lint`
Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/engine.ts packages/core/src/types.ts packages/core/src/index.ts \
  packages/core/src/test/memory-store.ts packages/core/src/engine.test.ts \
  packages/relayos/src/index.ts packages/relayos/src/index.test.ts
git rm packages/core/src/memory-store.ts packages/core/src/memory-store.test.ts 2>/dev/null || true
git commit -m "feat(core): required database config, relay.migrate(), lazy dev auto-migration; drop in-memory default"
```

---

### Task 8: Shared dialect contract test suite

**Files:**

- Create: `packages/core/src/db/store.contract.test.ts`
- Delete: `packages/postgres/src/store.test.ts` (superseded - deleted as part of Task 9's package removal, but the assertions below are its direct successor)

**Interfaces:**

- Consumes: `createSqlExecutionStore` from Task 5, `migrateToLatest` from Task 4, `SqlDialectName` from Task 2.
- Produces: nothing consumed by later tasks - this is the correctness proof for Task 5's store across all three dialects.

- [ ] **Step 1: Write the parametrized contract suite**

```ts
// packages/core/src/db/store.contract.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Kysely, CamelCasePlugin, type Dialect } from 'kysely';
import BetterSqlite3 from 'better-sqlite3';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { createPool as createMysqlPool } from 'mysql2';
import { Pool as PgPool } from 'pg';
import type { Execution, ExecutionStore } from '../types';
import type { Database } from './schema';
import { buildDialect, type SqlDialectName } from './detect';
import { createSqlExecutionStore } from './store';
import { migrateToLatest } from './migrate';

function makeExecution(overrides: Partial<Execution> = {}): Execution {
  const id = crypto.randomUUID();
  return {
    id,
    eventId: `evt-${id}`,
    eventType: 'test.event',
    eventData: { foo: 'bar' },
    status: 'pending',
    attempt: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

type Setup = {
  name: SqlDialectName;
  setup: () => Promise<{ store: ExecutionStore; teardown: () => Promise<void> }>;
};

const dialects: Setup[] = [
  {
    name: 'sqlite',
    async setup() {
      const client = new BetterSqlite3(':memory:');
      const { dialect } = buildDialect(client);
      const rawDb = new Kysely<any>({ dialect });
      await migrateToLatest(rawDb, 'sqlite');
      await rawDb.destroy();
      const db = new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] });
      return { store: createSqlExecutionStore(db, 'sqlite'), teardown: () => db.destroy() };
    },
  },
  {
    name: 'postgres',
    async setup() {
      const explicitUrl = process.env['TEST_DATABASE_URL'];
      let connectionString: string;
      let container: StartedPostgreSqlContainer | undefined;
      if (explicitUrl) {
        connectionString = explicitUrl;
      } else {
        container = await new PostgreSqlContainer('postgres:16-alpine').start();
        connectionString = container.getConnectionUri();
      }
      const client = new PgPool({ connectionString });
      const { dialect } = buildDialect(client);
      const rawDb = new Kysely<any>({ dialect });
      await migrateToLatest(rawDb, 'postgres');
      await rawDb.destroy();
      const db = new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] });
      return {
        store: createSqlExecutionStore(db, 'postgres'),
        teardown: async () => {
          await db.destroy();
          await container?.stop();
        },
      };
    },
  },
  {
    name: 'mysql',
    async setup() {
      const explicitUrl = process.env['TEST_MYSQL_URL'];
      let connectionString: string;
      let container: StartedMySqlContainer | undefined;
      if (explicitUrl) {
        connectionString = explicitUrl;
      } else {
        container = await new MySqlContainer('mysql:8.4').start();
        connectionString = container.getConnectionUri();
      }
      const client = createMysqlPool(connectionString);
      const { dialect } = buildDialect(client as unknown as Parameters<typeof buildDialect>[0]);
      const rawDb = new Kysely<any>({ dialect });
      await migrateToLatest(rawDb, 'mysql');
      await rawDb.destroy();
      const db = new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] });
      return {
        store: createSqlExecutionStore(db, 'mysql'),
        teardown: async () => {
          await db.destroy();
          await container?.stop();
        },
      };
    },
  },
];

describe.each(dialects)('createSqlExecutionStore ($name)', ({ setup }) => {
  let store: ExecutionStore;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ store, teardown } = await setup());
  }, 120_000);

  afterAll(async () => {
    await teardown();
  });

  it('create() returns true on first insert, false on a duplicate eventId', async () => {
    const execution = makeExecution();
    expect(await store.create(execution)).toBe(true);
    expect(await store.create(makeExecution({ eventId: execution.eventId }))).toBe(false);
  });

  it('get() and findByEventId() resolve the same execution', async () => {
    const execution = makeExecution();
    await store.create(execution);
    expect((await store.get(execution.id))?.eventId).toBe(execution.eventId);
    expect((await store.findByEventId(execution.eventId))?.id).toBe(execution.id);
    expect(await store.get('does-not-exist')).toBeUndefined();
  });

  it('eventData round-trips through JSON', async () => {
    const execution = makeExecution({ eventData: { nested: { n: 1 }, list: [1, 2, 3] } });
    await store.create(execution);
    expect((await store.get(execution.id))?.eventData).toEqual({
      nested: { n: 1 },
      list: [1, 2, 3],
    });
  });

  it('update() patches fields and clears error to null on success', async () => {
    const execution = makeExecution();
    await store.create(execution);

    await store.update(execution.id, {
      status: 'failed',
      attempt: 2,
      completedAt: new Date().toISOString(),
      error: 'boom',
    });
    let updated = await store.get(execution.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toBe('boom');

    await store.update(execution.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      error: undefined,
    });
    updated = await store.get(execution.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.error).toBeUndefined();
  });

  it('steps are append-only: saveStep never overwrites, getStep returns the latest', async () => {
    const execution = makeExecution();
    await store.create(execution);

    await store.saveStep({
      id: crypto.randomUUID(),
      executionId: execution.id,
      name: 'my-step',
      status: 'failed',
      error: 'transient',
      createdAt: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));
    await store.saveStep({
      id: crypto.randomUUID(),
      executionId: execution.id,
      name: 'my-step',
      status: 'completed',
      output: { ok: true },
      createdAt: new Date().toISOString(),
    });

    expect((await store.getStep(execution.id, 'my-step'))?.status).toBe('completed');

    const all = await store.listSteps(execution.id);
    expect(all).toHaveLength(2);
    expect(all[0]?.status).toBe('failed');
    expect(all[1]?.status).toBe('completed');
  });

  it('logs preserve source and insertion order', async () => {
    const execution = makeExecution();
    await store.create(execution);

    await store.saveLog({
      id: crypto.randomUUID(),
      executionId: execution.id,
      level: 'info',
      source: 'system',
      message: 'event ingested',
      createdAt: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));
    await store.saveLog({
      id: crypto.randomUUID(),
      executionId: execution.id,
      level: 'info',
      source: 'handler',
      message: 'did something',
      createdAt: new Date().toISOString(),
    });

    const logs = await store.listLogs(execution.id);
    expect(logs.map((l) => l.source)).toEqual(['system', 'handler']);
  });

  it('list() returns executions newest first', async () => {
    const first = makeExecution();
    await store.create(first);
    await new Promise((r) => setTimeout(r, 10));
    const second = makeExecution();
    await store.create(second);

    const all = await store.list();
    const firstIndex = all.findIndex((e) => e.id === first.id);
    const secondIndex = all.findIndex((e) => e.id === second.id);
    expect(secondIndex).toBeLessThan(firstIndex);
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `cd packages/core && pnpm test store.contract`
Expected: PASS for all three `describe.each` blocks (21 tests total: 7 assertions × 3 dialects). Postgres/MySQL blocks will pull and start real containers the first time (needs Docker) unless `TEST_DATABASE_URL`/`TEST_MYSQL_URL` are set - matching the existing `packages/postgres/src/store.test.ts` convention for CI environments without Docker-in-Docker.

- [ ] **Step 3: Run full coverage gate**

Run: `cd packages/core && pnpm test:coverage`
Expected: PASS, meeting the existing 80% lines/functions/branches/statements thresholds (`packages/core/vitest.config.ts`).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/db/store.contract.test.ts
git commit -m "test(core): parametrized ExecutionStore contract suite across postgres/sqlite/mysql"
```

---

### Task 9: Delete `@relayos/postgres`

**Files:**

- Delete: `packages/postgres/` (entire directory)
- Modify: `.changeset/config.json`

**Interfaces:**

- Consumes: nothing (this task only removes code once Tasks 1-8 have made it fully redundant).
- Produces: nothing - cleanup task.

- [ ] **Step 1: Remove the package**

```bash
git rm -r packages/postgres
```

- [ ] **Step 2: Update the changesets fixed group**

In `.changeset/config.json`, the `fixed` group is `[["relayos", "@relayos/*"]]` - this is a glob and doesn't name `@relayos/postgres` explicitly, so it needs no edit; changesets will simply stop seeing that package once it's gone from the workspace.

- [ ] **Step 3: Confirm the workspace no longer resolves it**

Run: `pnpm install`
Expected: no errors; `pnpm-lock.yaml` drops all `@relayos/postgres`, `drizzle-orm`, and `drizzle-kit` entries that aren't used elsewhere.

Run: `grep -rl "@relayos/postgres" --include="*.ts" --include="*.json" --include="*.mdx" .`
Expected: no matches outside anything not yet updated by Tasks 10 (docs, apps/web) - if this task runs before Task 10, `apps/web/relay.ts` and the docs will still reference it; that's expected and fixed there.

- [ ] **Step 4: Build the full workspace**

Run: `pnpm build`
Expected: every remaining package builds (this will fail until Task 10 rewires `apps/web/relay.ts` - if executing tasks in order, run this check again after Task 10 instead of here).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove @relayos/postgres - database support now lives in @relayos/core"
```

---

### Task 10: Rewire `apps/web` and update docs

**Files:**

- Modify: `apps/web/relay.ts`
- Delete: `apps/docs/content/docs/database/postgres.mdx`
- Delete: `apps/docs/content/docs/database/memory.mdx`
- Create: `apps/docs/content/docs/database/index.mdx`
- Modify: `apps/docs/content/docs/database/meta.json`

**Interfaces:**

- Consumes: the new `relayos({ database })` API from Task 7.
- Produces: nothing consumed elsewhere - this is the last task in the plan.

- [ ] **Step 1: Rewire `apps/web/relay.ts`**

Replace the top of `apps/web/relay.ts`:

```ts
import { createDb, createPostgresExecutionStore } from '@relayos/postgres';
```

with:

```ts
import { Pool } from 'pg';
```

Replace:

```ts
const db = createDb(process.env.DATABASE_URL ?? 'postgres://localhost:5432/relayos_dev');
```

with:

```ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://localhost:5432/relayos_dev',
});
```

Replace:

```ts
  database: createPostgresExecutionStore(db),
```

with:

```ts
  database: pool,
```

- [ ] **Step 2: Add `pg` as a direct dependency of `apps/web`**

Check `apps/web/package.json` for an existing `pg` dependency (it was previously transitive through `@relayos/postgres`); if absent, add it:

```json
    "pg": "^8.13.0"
```

- [ ] **Step 3: Verify apps/web builds and its own tests pass**

Run: `cd apps/web && pnpm build`
Expected: no type errors, `relay.ts` compiles against the new `RelayConfig.database` union type.

- [ ] **Step 4: Replace the database docs with a unified page**

```bash
git rm apps/docs/content/docs/database/postgres.mdx apps/docs/content/docs/database/memory.mdx
```

````mdx
---
title: Database
description: Persist executions, steps, and logs to Postgres, SQLite, or MySQL.
---

Pass a database client straight into `relayos({ database })` - the dialect is
detected automatically from the client you pass, and RelayOS applies its
schema migrations for you.

## Postgres

<Tabs items={['pnpm', 'npm', 'yarn', 'bun']}>
<Tab value="pnpm">
```sh
pnpm add pg
````

</Tab>
<Tab value="npm">
```sh
npm install pg
```
</Tab>
<Tab value="yarn">
```sh
yarn add pg
```
</Tab>
<Tab value="bun">
```sh
bun add pg
```
</Tab>
</Tabs>

```ts
// relay.ts
import { relayos } from 'relayos';
import { Pool } from 'pg';

export const relay = relayos({
  database: new Pool({ connectionString: process.env.DATABASE_URL! }),
  plugins: [
    // ...
  ],
});
```

## SQLite

<Tabs items={['pnpm', 'npm', 'yarn', 'bun']}>
<Tab value="pnpm">

```sh
pnpm add better-sqlite3
```

</Tab>
<Tab value="npm">
```sh
npm install better-sqlite3
```
</Tab>
<Tab value="yarn">
```sh
yarn add better-sqlite3
```
</Tab>
<Tab value="bun">
```sh
bun add better-sqlite3
```
</Tab>
</Tabs>

```ts
// relay.ts
import { relayos } from 'relayos';
import Database from 'better-sqlite3';

export const relay = relayos({
  database: new Database('relay.db'),
  plugins: [
    // ...
  ],
});
```

Good for local development, testing, and small single-instance deployments.
Not recommended once you're running multiple instances of your app.

## MySQL

<Tabs items={['pnpm', 'npm', 'yarn', 'bun']}>
<Tab value="pnpm">

```sh
pnpm add mysql2
```

</Tab>
<Tab value="npm">
```sh
npm install mysql2
```
</Tab>
<Tab value="yarn">
```sh
yarn add mysql2
```
</Tab>
<Tab value="bun">
```sh
bun add mysql2
```
</Tab>
</Tabs>

```ts
// relay.ts
import { relayos } from 'relayos';
import { createPool } from 'mysql2';

export const relay = relayos({
  database: createPool({
    uri: process.env.DATABASE_URL!,
    timezone: 'Z', // keeps timestamps consistent in UTC
  }),
  plugins: [
    // ...
  ],
});
```

Use `mysql2`'s pool directly, not `mysql2/promise` - RelayOS's dialect
detection and the underlying query engine (Kysely) both expect the
callback-style pool.

## Migrations

Outside production, migrations apply automatically the first time your relay
processes an event or you call any of its methods - nothing to run by hand
in development.

In production, run them explicitly before scaling up new instances:

```sh
DATABASE_URL=<your-db> relay migrate
```

This is idempotent - safe to run multiple times, and safe to run from CI
before a deploy. It creates three tables: `relayos_executions`,
`relayos_execution_steps` (an append-only audit trail - a step that failed
and later succeeded stores both attempts), and `relayos_execution_logs`
(interleaved system and handler logs).

## Writing a custom store

Implement the `ExecutionStore` interface yourself for any other persistence
layer - `database` also accepts a plain `ExecutionStore` directly:

```ts
import type { ExecutionStore } from '@relayos/core';

const myStore: ExecutionStore = {
  // Create an execution, returning true if this call won the insert race.
  // Multiple concurrent ingest() calls for the same eventId must collapse
  // to a single execution - this is the atomic dedup check.
  async create(execution) {
    // Atomic insert-or-detect-conflict: if the eventId already exists,
    // return false without throwing. Only the first caller should return true.
  },

  async update(id, patch) {
    // Patch status, attempt, completedAt, or error.
  },

  async list() {
    // Return all executions, newest first.
  },

  async get(id) {
    // Return one execution by ID.
  },

  async findByEventId(eventId) {
    // Return the execution for a given event ID, if any.
  },

  async getStep(executionId, name) {
    // Return the most recent attempt at this step (newest createdAt), or undefined.
  },

  async saveStep(step) {
    // Always append - never upsert. Step history is an audit trail.
  },

  async listSteps(executionId) {
    // Return all steps for an execution, in createdAt order.
  },

  async saveLog(log) {
    // Append a log line.
  },

  async listLogs(executionId) {
    // Return all logs for an execution, in createdAt order.
  },
};

export const relay = relayos({
  database: myStore,
  plugins: [
    // ...
  ],
});
```

Key invariants:

- **create() must be atomic**: concurrent calls for the same `eventId` must
  result in exactly one execution. The winner returns `true`; losers return
  `false`.
- **saveStep() is append-only**: never update or overwrite an existing step.
- **getStep() returns the latest attempt**: `ctx.step.run()` needs the most
  recent one by `createdAt` to know its status.

A custom store's `migrate()` is a no-op - RelayOS has no schema to apply for
a persistence layer it doesn't own.

````

Save this as `apps/docs/content/docs/database/index.mdx`.

- [ ] **Step 5: Update the database section's nav**

In `apps/docs/content/docs/database/meta.json`, change:
```json
{
  "title": "Database",
  "pages": ["postgres", "memory"]
}
````

to:

```json
{
  "title": "Database",
  "pages": ["index"]
}
```

- [ ] **Step 6: Build the docs app**

Run: `cd apps/docs && pnpm build`
Expected: no broken internal links (search the built output or `pnpm build`'s own link-check for any remaining `/docs/database/postgres` or `/docs/database/memory` references from other pages, e.g. `apps/docs/content/docs/index.mdx`, `apps/docs/content/docs/installation.mdx` - update any found to point at `/docs/database`).

- [ ] **Step 7: Full workspace verification**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: everything green - this is the final gate for the whole plan.

- [ ] **Step 8: Commit**

```bash
git add apps/web/relay.ts apps/web/package.json apps/docs/content/docs/database
git commit -m "docs: unify database docs across postgres/sqlite/mysql; rewire apps/web onto the new API"
```

---

## Self-Review

**Spec coverage:**

- Fold DB support into core, drop the separate postgres package → Tasks 1-9.
- Accept raw `PostgresPool`/`SqliteDatabase`/`MysqlPool` directly, auto-detected → Tasks 2, 6.
- Drop Drizzle, use Kysely (lightweight) → Tasks 1, 3, 4, 5 (no Drizzle anywhere in the new code).
- No in-memory store as a production option → Task 7 (moved to a private, unexported test helper).
- SQLite as the practical dev/testing fallback → covered in Task 10's docs; the CLI plan (separate document) makes it `relay init`'s scaffolded default.
- Idempotent migrations, "fixed number of tables" handled via lightweight versioning → Task 4.
- `{ dialect }` escape hatch for anything else Kysely supports (MSSQL, etc.) → Task 6.
- Migration timing: auto in dev, explicit in prod → Task 7's `ensureMigrated()` + `relay.migrate()`.
- Shared contract tests across dialects → Task 8.

**Placeholder scan:** no TBDs, no "add appropriate handling," no unimplemented steps - every code step above is complete, working TypeScript.

**Type consistency:** `SqlDialectName`, `RawSqlClient`, `RelayDatabaseConfig`, `resolveDatabase`, `createSqlExecutionStore`, `migrateToLatest`, and the `Database`/`RelayosExecutionsTable`/etc. schema names are used identically across Tasks 2-8.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-12-multi-dialect-storage.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
