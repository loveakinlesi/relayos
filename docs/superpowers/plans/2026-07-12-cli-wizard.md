# CLI Interactive Wizard & Dialect-Agnostic Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `relay init` into an interactive wizard (app name, framework detection, database choice, plugins, package-manager-aware install), and stop every other CLI command (`migrate`, `inspect`, `replay`, `events list`, `dev`'s watcher) from hand-rolling a Postgres-only DB connection from `DATABASE_URL`. Instead they dynamically load the user's real `relay.ts` and drive it through its already-public methods.

**Architecture:** A `loadRelay()` helper uses `jiti` to import the user's `relay.ts` directly (no build step required) and returns the live `Relay` instance. Every command that used to reconnect to the database now calls `loadRelay()` once and uses `relay.migrate()` / `relay.listExecutions()` / `relay.listSteps()` / `relay.listLogs()` - fully dialect-agnostic, since the CLI never touches `pg`/`better-sqlite3`/`mysql2` itself. `relay init` becomes a `@clack/prompts`-driven wizard that detects Next.js from `package.json`, asks for a database and plugin selection, detects the package manager from the lockfile present, writes a dynamically-generated `relay.ts`, and installs exactly the packages the choices require.

**Tech Stack:** `jiti` 2.x (TS-aware dynamic import of the user's config), `@clack/prompts` 1.x (interactive CLI prompts).

## Global Constraints

- **Depends on the storage-layer plan** (`docs/superpowers/plans/2026-07-12-multi-dialect-storage.md`) being implemented first - specifically `Relay.migrate()` existing and `RelayConfig.database` accepting a raw driver client directly. Do not start this plan until that one's Task 7 is done.
- The CLI drops its `@relayos/postgres`, `drizzle-orm`, and `pg` dependencies entirely - once every command goes through the user's own `relay.ts` via `loadRelay()`, the CLI package itself never touches a database driver.
- Package-manager selection is **auto-detected from the lockfile present**, never prompted - this was an explicit decision, not an oversight, even though it means the wizard's actual set of prompts is app name, framework (skipped if detected), database, and plugins.
- Framework support for v1 is **Next.js-only**, detected via `package.json`'s `next` dependency; anything else falls back to the existing framework-agnostic scaffold with a manual-wiring note. No other framework integrations are built as part of this plan.
- No published npm versions exist for any `@relayos/*` package (verified via `npm view`, all 404) - this is a breaking CLI redesign with no back-compat burden, so `relay init` is allowed to change shape entirely rather than keep its old non-interactive mode as a fallback.

---

### Task 1: Update CLI dependencies

**Files:**

- Modify: `packages/cli/package.json`

**Interfaces:**

- Produces: `@clack/prompts` and `jiti` importable from CLI source; `@relayos/postgres`, `drizzle-orm` removed.

- [ ] **Step 1: Edit dependencies**

In `packages/cli/package.json`, replace the `"dependencies"` block:

```json
  "dependencies": {
    "@relayos/core": "workspace:^",
    "@relayos/stripe": "workspace:^",
    "@relayos/github": "workspace:^",
    "@clack/prompts": "^1.7.0",
    "jiti": "^2.7.0"
  },
```

(Dropping `@relayos/postgres` and `drizzle-orm` - the CLI no longer imports either.)

- [ ] **Step 2: Install**

Run: `cd packages/cli && pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/package.json pnpm-lock.yaml
git commit -m "chore(cli): swap drizzle/postgres deps for jiti and @clack/prompts"
```

---

### Task 2: Package manager detection and install

**Files:**

- Create: `packages/cli/src/package-manager.ts`
- Test: `packages/cli/src/package-manager.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm'`, `detectPackageManager(dir: string): Promise<PackageManager>`, `installPackages(pm: PackageManager, dir: string, packages: string[]): Promise<void>` - consumed by Task 6's wizard.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/cli/src/package-manager.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectPackageManager } from './package-manager';

describe('detectPackageManager', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('detects pnpm from pnpm-lock.yaml', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-pm-'));
    await writeFile(join(dir, 'pnpm-lock.yaml'), '', 'utf8');
    expect(await detectPackageManager(dir)).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-pm-'));
    await writeFile(join(dir, 'yarn.lock'), '', 'utf8');
    expect(await detectPackageManager(dir)).toBe('yarn');
  });

  it('falls back to npm when no lockfile is present', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-pm-'));
    expect(await detectPackageManager(dir)).toBe('npm');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test package-manager`
Expected: FAIL - `Cannot find module './package-manager'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/cli/src/package-manager.ts
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

const lockfiles: [string, PackageManager][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

export async function detectPackageManager(dir: string): Promise<PackageManager> {
  for (const [file, pm] of lockfiles) {
    try {
      await access(join(dir, file));
      return pm;
    } catch {
      // keep looking
    }
  }
  return 'npm';
}

const addArgs: Record<PackageManager, string[]> = {
  pnpm: ['add'],
  yarn: ['add'],
  bun: ['add'],
  npm: ['install'],
};

export function installPackages(
  pm: PackageManager,
  dir: string,
  packages: string[],
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(pm, [...addArgs[pm], ...packages], {
      cwd: dir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${pm} ${addArgs[pm].join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test package-manager`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/package-manager.ts packages/cli/src/package-manager.test.ts
git commit -m "feat(cli): lockfile-based package manager detection and install"
```

---

### Task 3: `loadRelay()` - dynamically import the user's relay.ts

**Files:**

- Create: `packages/cli/src/load-relay.ts`
- Test: `packages/cli/src/load-relay.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `loadRelay(dir: string): Promise<Relay>` - consumed by Task 4's rewritten commands.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/load-relay.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRelay } from './load-relay';

describe('loadRelay', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('imports relay.ts from the given directory and returns its `relay` export', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-load-'));
    await writeFile(
      join(dir, 'relay.ts'),
      `export const relay = {
        migrate: async () => 'migrated',
        listExecutions: async () => [{ id: '1' }],
      };
      `,
      'utf8',
    );

    const relay = (await loadRelay(dir)) as {
      migrate: () => Promise<string>;
      listExecutions: () => Promise<unknown[]>;
    };
    expect(await relay.migrate()).toBe('migrated');
    expect(await relay.listExecutions()).toEqual([{ id: '1' }]);
  });

  it('throws a clear error when relay.ts does not exist', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-load-'));
    await expect(loadRelay(dir)).rejects.toThrow(/relay\.ts/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test load-relay`
Expected: FAIL - `Cannot find module './load-relay'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/cli/src/load-relay.ts
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { createJiti } from 'jiti';
import type { Relay } from '@relayos/core';

export async function loadRelay(dir: string): Promise<Relay> {
  const configPath = join(dir, 'relay.ts');
  try {
    await access(configPath);
  } catch {
    throw new Error(`Could not find relay.ts in ${dir}. Run "relay init" first, or pass --dir.`);
  }

  const jiti = createJiti(import.meta.url);
  const mod = (await jiti.import(configPath)) as { relay?: Relay };
  if (!mod.relay) {
    throw new Error(
      `${configPath} does not export a "relay" - expected "export const relay = relayos({ ... })".`,
    );
  }
  return mod.relay;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test load-relay`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/load-relay.ts packages/cli/src/load-relay.test.ts
git commit -m "feat(cli): dynamically load the user's relay.ts via jiti"
```

---

### Task 4: Rewrite `migrate`, `inspect`, `replay`, `events list`, and `dev`'s watcher onto `loadRelay()`

**Files:**

- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/utils.ts` (add `resolveDir`)
- Modify: `packages/cli/src/utils.test.ts`

**Interfaces:**

- Consumes: `loadRelay` from Task 3.
- Produces: `resolveDir(args: string[]): string` - a small shared helper, used by every rewritten command in this task.

- [ ] **Step 1: Add `resolveDir` to utils.ts, with a test**

In `packages/cli/src/utils.test.ts`, add:

```ts
describe('resolveDir', () => {
  it('resolves --dir relative to cwd', () => {
    expect(resolveDir(['--dir', 'apps/web'])).toBe(resolve('apps/web'));
  });

  it('defaults to process.cwd() when --dir is absent', () => {
    expect(resolveDir([])).toBe(process.cwd());
  });
});
```

Add the necessary imports at the top of `packages/cli/src/utils.test.ts`:

```ts
import { resolve } from 'node:path';
import { resolveDir } from './utils';
```

Run: `cd packages/cli && pnpm test utils` — expect FAIL (`resolveDir` doesn't exist yet).

In `packages/cli/src/utils.ts`, add:

```ts
import { resolve } from 'node:path';

export function resolveDir(args: string[]): string {
  const dir = getFlag(args, '--dir');
  return dir ? resolve(dir) : process.cwd();
}
```

Run: `cd packages/cli && pnpm test utils` — expect PASS.

- [ ] **Step 2: Remove the old DB-reconnection imports and `requireDatabaseUrl`**

In `packages/cli/src/index.ts`, delete:

```ts
import { gt } from 'drizzle-orm';
import {
  createDb,
  createPostgresExecutionStore,
  executions,
  runMigrations,
} from '@relayos/postgres';
```

and delete the entire `requireDatabaseUrl` function and its JSDoc-less body:

```ts
function requireDatabaseUrl(): string | undefined {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('DATABASE_URL must be set.');
    process.exitCode = 1;
    return undefined;
  }
  return connectionString;
}
```

Add instead:

```ts
import type { Execution, Relay, RelayPlugin } from '@relayos/core';
import { loadRelay } from './load-relay';
import {
  resolveDir,
  getFlag,
  hasFlag,
  resolveBaseUrl,
  statusIcon,
  formatDuration,
  latestStepsByName,
} from './utils';
```

(replacing the existing narrower `import type { Execution, ExecutionStore, RelayPlugin } from '@relayos/core';` and the existing `./utils` import line - `ExecutionStore` is no longer needed here, `Relay` is.)

- [ ] **Step 3: Rewrite `resolveExecution` to work off `Relay` instead of `ExecutionStore`**

Replace:

```ts
async function resolveExecution(store: ExecutionStore, id: string): Promise<Execution | undefined> {
  return (await store.findByEventId(id)) ?? (await store.get(id));
}
```

with:

```ts
async function resolveExecution(relay: Relay, id: string): Promise<Execution | undefined> {
  const all = await relay.listExecutions();
  return (
    all.find((execution) => execution.eventId === id) ??
    all.find((execution) => execution.id === id)
  );
}
```

- [ ] **Step 4: Rewrite `migrate`**

Replace:

```ts
async function migrate() {
  const connectionString = requireDatabaseUrl();
  if (!connectionString) return;

  const db = createDb(connectionString);
  console.log('Applying RelayOS migrations...');
  await runMigrations(db);
  console.log('Migrations applied.');
}
```

with:

```ts
async function migrate(args: string[]) {
  const relay = await loadRelay(resolveDir(args));
  console.log('Applying RelayOS migrations...');
  await relay.migrate();
  console.log('Migrations applied.');
}
```

- [ ] **Step 5: Rewrite `inspect`**

Replace:

```ts
const connectionString = requireDatabaseUrl();
if (!connectionString) return;

const db = createDb(connectionString);
const store = createPostgresExecutionStore(db);
const execution = await resolveExecution(store, id);
```

with:

```ts
const relay = await loadRelay(resolveDir(args));
const execution = await resolveExecution(relay, id);
```

and, further down in the same function, replace:

```ts
const steps = await store.listSteps(execution.id);
const logs = await store.listLogs(execution.id);
```

with:

```ts
const steps = await relay.listSteps(execution.id);
const logs = await relay.listLogs(execution.id);
```

- [ ] **Step 6: Rewrite `replay`'s store lookup**

Replace:

```ts
const connectionString = requireDatabaseUrl();
if (!connectionString) return;

const db = createDb(connectionString);
const store = createPostgresExecutionStore(db);
const execution = await resolveExecution(store, id);
```

with:

```ts
const relay = await loadRelay(resolveDir(args));
const execution = await resolveExecution(relay, id);
```

(The rest of `replay` - the `--print` dry run and the actual `POST /api/executions/{id}/replay` HTTP call - is unchanged.)

- [ ] **Step 7: Rewrite `eventsList`**

Replace:

```ts
const connectionString = requireDatabaseUrl();
if (!connectionString) return;

const db = createDb(connectionString);
const store = createPostgresExecutionStore(db);
const all = await store.list();
```

with:

```ts
const relay = await loadRelay(resolveDir(args));
const all = await relay.listExecutions();
```

- [ ] **Step 8: Rewrite `dev`'s watcher**

Replace the whole watcher block:

```ts
let watcher: ReturnType<typeof setInterval> | undefined;
const connectionString = process.env['DATABASE_URL'];

if (connectionString) {
  const db = createDb(connectionString);
  let lastSeen = new Date();
  console.log('[relay dev] watching for executions...');

  watcher = setInterval(() => {
    db.select()
      .from(executions)
      .where(gt(executions.createdAt, lastSeen))
      .then((rows) => {
        for (const row of rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
          if (row.createdAt > lastSeen) lastSeen = row.createdAt;
          console.log(
            `[relay dev] ${statusIcon(row.status)} ${row.eventType} (attempt ${row.attempt}) ${row.id}`,
          );
        }
      })
      .catch((err: unknown) => {
        console.error('[relay dev] failed to poll executions', err);
      });
  }, 1000);
} else {
  console.log('[relay dev] DATABASE_URL not set - skipping live execution feed');
}
```

with:

```ts
let watcher: ReturnType<typeof setInterval> | undefined;
let lastSeen = new Date(0);

try {
  const relay = await loadRelay(dir);
  console.log('[relay dev] watching for executions...');

  watcher = setInterval(() => {
    relay
      .listExecutions()
      .then((all) => {
        const fresh = all
          .filter((execution) => new Date(execution.createdAt) > lastSeen)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        for (const execution of fresh) {
          const createdAt = new Date(execution.createdAt);
          if (createdAt > lastSeen) lastSeen = createdAt;
          console.log(
            `[relay dev] ${statusIcon(execution.status)} ${execution.eventType} (attempt ${execution.attempt}) ${execution.id}`,
          );
        }
      })
      .catch((err: unknown) => {
        console.error('[relay dev] failed to poll executions', err);
      });
  }, 1000);
} catch (err) {
  console.log(
    `[relay dev] ${err instanceof Error ? err.message : String(err)} - skipping live execution feed`,
  );
}
```

(`dir` is already in scope earlier in `dev` - it's resolved from `--dir` at the top of the function.)

- [ ] **Step 9: Update `main()`'s dispatch for `migrate`**

Replace:

```ts
    case 'migrate':
      await migrate();
      return;
```

with:

```ts
    case 'migrate':
      await migrate(rest);
      return;
```

- [ ] **Step 10: Update `USAGE`**

Replace the `migrate`, `dev`, `inspect`, `replay`, and `events list` usage lines:

```
  init [--force]                          Scaffold relay.ts and relay.handlers.ts
  migrate                                Apply RelayOS's Postgres migrations (reads DATABASE_URL)
  dev [--dir <path>]                      Run the app's dev server and tail new executions live
                                          (tailing requires DATABASE_URL; --dir defaults to cwd)
  trigger <provider> <eventType>          Simulate a signed provider webhook delivery
    [--data '<json>'] [--forward <url>]   (reads <PROVIDER>_WEBHOOK_SECRET; --forward defaults to
                                          RELAYOS_BASE_URL or http://localhost:3000)
  inspect <eventId|executionId>           Show an execution's status, steps, and logs
    [--json] [--history]                  (reads DATABASE_URL directly, no running app needed)
  replay <eventId|executionId>            Replay a historical execution as a new one
    [--forward <url>] [--print]           (resolves via DATABASE_URL; --print dry-runs with no
                                          HTTP call; otherwise replays via --forward)
  events list [--json] [--limit <n>]      List recent executions, newest first
                                          (reads DATABASE_URL directly, no running app needed)
```

with:

```
  init [--force]                          Interactive wizard: scaffolds relay.ts and
                                          relay.handlers.ts, installs the packages you choose
  migrate [--dir <path>]                  Apply pending schema migrations (loads relay.ts;
                                          --dir defaults to cwd)
  dev [--dir <path>]                      Run the app's dev server and tail new executions live
                                          (loads relay.ts from --dir, defaults to cwd)
  trigger <provider> <eventType>          Simulate a signed provider webhook delivery
    [--data '<json>'] [--forward <url>]   (reads <PROVIDER>_WEBHOOK_SECRET; --forward defaults to
                                          RELAYOS_BASE_URL or http://localhost:3000)
  inspect <eventId|executionId>           Show an execution's status, steps, and logs
    [--json] [--history] [--dir <path>]   (loads relay.ts directly, no running app needed)
  replay <eventId|executionId>            Replay a historical execution as a new one
    [--forward <url>] [--print]           (resolves via relay.ts; --print dry-runs with no
    [--dir <path>]                        HTTP call; otherwise replays via --forward)
  events list [--json] [--limit <n>]      List recent executions, newest first
    [--dir <path>]                        (loads relay.ts directly, no running app needed)
```

- [ ] **Step 11: Update call sites passing `args` through to `inspect`/`replay`/`eventsList`**

These three functions already receive `args: string[]` as their parameter - they now also read `--dir` from it via `resolveDir(args)`, so no signature changes are needed at their call sites in `main()`.

- [ ] **Step 12: Run the CLI test suite and typecheck**

Run: `cd packages/cli && pnpm test && pnpm lint`
Expected: all PASS, no type errors.

- [ ] **Step 13: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/utils.ts packages/cli/src/utils.test.ts
git commit -m "feat(cli): drive migrate/inspect/replay/events/dev through the user's relay.ts, not a hardcoded Postgres connection"
```

---

### Task 5: Dynamic `relay.ts` template builder

**Files:**

- Modify: `packages/cli/src/templates.ts`
- Test: `packages/cli/src/templates.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `type DatabaseChoice = 'sqlite' | 'postgres' | 'mysql'`, `type PluginChoice = 'stripe' | 'github'`, `databasePackages: Record<DatabaseChoice, string>`, `pluginPackages: Record<PluginChoice, string>`, `buildRelayConfigTemplate(options: { database: DatabaseChoice; plugins: PluginChoice[] }): string` - consumed by Task 6's wizard.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/cli/src/templates.test.ts
import { describe, it, expect } from 'vitest';
import { buildRelayConfigTemplate, databasePackages, pluginPackages } from './templates';

describe('buildRelayConfigTemplate', () => {
  it('wires a sqlite database expression with no plugins', () => {
    const output = buildRelayConfigTemplate({ database: 'sqlite', plugins: [] });
    expect(output).toContain("import Database from 'better-sqlite3';");
    expect(output).toContain("database: new Database('relay.db')");
    expect(output).not.toContain('stripe');
  });

  it('wires a postgres database expression and a stripe plugin', () => {
    const output = buildRelayConfigTemplate({ database: 'postgres', plugins: ['stripe'] });
    expect(output).toContain("import { Pool } from 'pg';");
    expect(output).toContain("import { stripe } from '@relayos/stripe';");
    expect(output).toContain('stripe({ webhookSecret: process.env.STRIPE_WEBHOOK_SECRET! })');
  });

  it('wires a mysql database expression and both plugins', () => {
    const output = buildRelayConfigTemplate({ database: 'mysql', plugins: ['stripe', 'github'] });
    expect(output).toContain("import { createPool } from 'mysql2';");
    expect(output).toContain("import { github } from '@relayos/github';");
    expect(output).toContain('github({ webhookSecret: process.env.GITHUB_WEBHOOK_SECRET! })');
  });

  it('exposes the package name for each database and plugin choice', () => {
    expect(databasePackages.sqlite).toBe('better-sqlite3');
    expect(databasePackages.postgres).toBe('pg');
    expect(databasePackages.mysql).toBe('mysql2');
    expect(pluginPackages.stripe).toBe('@relayos/stripe');
    expect(pluginPackages.github).toBe('@relayos/github');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test templates`
Expected: FAIL - `buildRelayConfigTemplate is not exported`

- [ ] **Step 3: Write the implementation**

In `packages/cli/src/templates.ts`, remove the old static `RELAY_CONFIG_TEMPLATE` and `INIT_NEXT_STEPS` exports (the wizard in Task 6 replaces both - the config is now generated per-choice, and the wizard prints its own closing summary via `@clack/prompts`'s `outro`). Keep `RELAY_HANDLERS_TEMPLATE` as-is. Add:

```ts
export type DatabaseChoice = 'sqlite' | 'postgres' | 'mysql';
export type PluginChoice = 'stripe' | 'github';

export const databasePackages: Record<DatabaseChoice, string> = {
  sqlite: 'better-sqlite3',
  postgres: 'pg',
  mysql: 'mysql2',
};

export const pluginPackages: Record<PluginChoice, string> = {
  stripe: '@relayos/stripe',
  github: '@relayos/github',
};

const databaseImportLine: Record<DatabaseChoice, string> = {
  sqlite: "import Database from 'better-sqlite3';",
  postgres: "import { Pool } from 'pg';",
  mysql: "import { createPool } from 'mysql2';",
};

const databaseExpression: Record<DatabaseChoice, string> = {
  sqlite: "new Database('relay.db')",
  postgres: 'new Pool({ connectionString: process.env.DATABASE_URL! })',
  mysql: "createPool({ uri: process.env.DATABASE_URL!, timezone: 'Z' })",
};

const pluginImportLine: Record<PluginChoice, string> = {
  stripe: "import { stripe } from '@relayos/stripe';",
  github: "import { github } from '@relayos/github';",
};

const pluginExpression: Record<PluginChoice, string> = {
  stripe: 'stripe({ webhookSecret: process.env.STRIPE_WEBHOOK_SECRET! })',
  github: 'github({ webhookSecret: process.env.GITHUB_WEBHOOK_SECRET! })',
};

export function buildRelayConfigTemplate(options: {
  database: DatabaseChoice;
  plugins: PluginChoice[];
}): string {
  const imports = [
    "import { relayos } from 'relayos';",
    databaseImportLine[options.database],
    ...options.plugins.map((plugin) => pluginImportLine[plugin]),
    "import { registerHandlers } from './relay.handlers';",
  ].join('\n');

  const pluginLines = options.plugins
    .map((plugin) => `    ${pluginExpression[plugin]},`)
    .join('\n');

  return `${imports}

export const relay = relayos({
  database: ${databaseExpression[options.database]},
  plugins: [
${pluginLines}
  ],
});

// The concrete relay type, including the typed event catalog inferred from
// the plugins above - exported so relay.handlers.ts (or any other module)
// can register handlers with full event.data typing, without needing to
// duplicate the plugins list.
export type AppRelay = typeof relay;

registerHandlers(relay);
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test templates`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/templates.ts packages/cli/src/templates.test.ts
git commit -m "feat(cli): generate relay.ts from the wizard's database/plugin choices"
```

---

### Task 6: The interactive `relay init` wizard

**Files:**

- Create: `packages/cli/src/wizard.ts`
- Modify: `packages/cli/src/index.ts` (`init` now delegates to the wizard)

**Interfaces:**

- Consumes: `buildRelayConfigTemplate`/`databasePackages`/`pluginPackages`/`RELAY_HANDLERS_TEMPLATE` from Task 5, `detectPackageManager`/`installPackages` from Task 2.
- Produces: `runInitWizard(dir: string, force: boolean): Promise<void>` - consumed by `index.ts`'s `init` command.

This task has no automated test - it's an interactive terminal flow (prompts, spinners) that isn't meaningfully unit-testable without mocking `@clack/prompts` wholesale, which would just assert that mocked functions were called in order rather than proving anything about the real experience. Verify it manually per Step 4 below instead.

- [ ] **Step 1: Write the wizard**

```ts
// packages/cli/src/wizard.ts
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import {
  RELAY_HANDLERS_TEMPLATE,
  buildRelayConfigTemplate,
  databasePackages,
  pluginPackages,
  type DatabaseChoice,
  type PluginChoice,
} from './templates';
import { detectPackageManager, installPackages } from './package-manager';

async function detectNextJs(dir: string): Promise<boolean> {
  try {
    const raw = await readFile(join(dir, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.dependencies?.['next'] ?? pkg.devDependencies?.['next']);
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function runInitWizard(dir: string, force: boolean): Promise<void> {
  p.intro('relay init');

  const appName = await p.text({
    message: 'App name',
    placeholder: 'my-app',
    defaultValue: 'my-app',
  });
  if (p.isCancel(appName)) {
    p.cancel('Cancelled.');
    return;
  }

  const nextDetected = await detectNextJs(dir);
  let framework: 'nextjs' | 'generic';
  if (nextDetected) {
    p.log.info('Detected Next.js - wiring the App Router handler.');
    framework = 'nextjs';
  } else {
    const chosen = await p.select({
      message: 'Framework',
      options: [
        { value: 'nextjs' as const, label: 'Next.js' },
        { value: 'generic' as const, label: 'Other / generic (wire the handler manually)' },
      ],
    });
    if (p.isCancel(chosen)) {
      p.cancel('Cancelled.');
      return;
    }
    framework = chosen;
  }

  const database = await p.select({
    message: 'Database',
    options: [
      { value: 'sqlite' as const, label: 'SQLite', hint: 'recommended to get started' },
      { value: 'postgres' as const, label: 'Postgres' },
      { value: 'mysql' as const, label: 'MySQL' },
    ],
  });
  if (p.isCancel(database)) {
    p.cancel('Cancelled.');
    return;
  }

  const plugins = await p.multiselect({
    message: 'Plugins to enable',
    options: [
      { value: 'stripe' as const, label: 'Stripe' },
      { value: 'github' as const, label: 'GitHub' },
    ],
    required: false,
  });
  if (p.isCancel(plugins)) {
    p.cancel('Cancelled.');
    return;
  }

  const configPath = join(dir, 'relay.ts');
  const handlersPath = join(dir, 'relay.handlers.ts');
  if (!force) {
    for (const path of [configPath, handlersPath]) {
      if (await pathExists(path)) {
        p.cancel(`${path} already exists. Use --force to overwrite.`);
        return;
      }
    }
  }

  await writeFile(handlersPath, RELAY_HANDLERS_TEMPLATE, 'utf8');
  p.log.step(`Created ${handlersPath}`);
  await writeFile(
    configPath,
    buildRelayConfigTemplate({
      database: database as DatabaseChoice,
      plugins: plugins as PluginChoice[],
    }),
    'utf8',
  );
  p.log.step(`Created ${configPath}`);

  if (framework === 'nextjs') {
    const routeDir = join(dir, 'app', 'api', 'relay', '[...all]');
    await mkdir(routeDir, { recursive: true });
    const routePath = join(routeDir, 'route.ts');
    await writeFile(
      routePath,
      `import { toNextJsHandler } from 'relayos/next-js';\nimport { relay } from '../../../../relay';\n\nexport const { POST } = toNextJsHandler(relay);\n`,
      'utf8',
    );
    p.log.step(`Created ${routePath}`);
  }

  const pm = await detectPackageManager(dir);
  const packages = [
    'relayos',
    databasePackages[database as DatabaseChoice],
    ...(plugins as PluginChoice[]).map((choice) => pluginPackages[choice]),
  ];

  const spinner = p.spinner();
  spinner.start(`Installing dependencies with ${pm}`);
  await installPackages(pm, dir, packages);
  spinner.stop(`Installed ${packages.join(', ')}`);

  p.outro('Done. Add a relay.on(...) call in relay.handlers.ts to get started.');
}
```

- [ ] **Step 2: Wire it into `init`**

In `packages/cli/src/index.ts`, replace the entire `init` function:

```ts
async function init(args: string[]) {
  const configPath = join(process.cwd(), 'relay.ts');
  const handlersPath = join(process.cwd(), 'relay.handlers.ts');
  const force = hasFlag(args, '--force');

  if (!force) {
    for (const path of [configPath, handlersPath]) {
      try {
        await access(path);
        console.error(`${path} already exists. Use --force to overwrite.`);
        process.exitCode = 1;
        return;
      } catch {
        // Doesn't exist - clear to write.
      }
    }
  }

  await writeFile(handlersPath, RELAY_HANDLERS_TEMPLATE, 'utf8');
  console.log(`Created ${handlersPath}`);
  await writeFile(configPath, RELAY_CONFIG_TEMPLATE, 'utf8');
  console.log(`Created ${configPath}`);
  console.log(INIT_NEXT_STEPS);
}
```

with:

```ts
async function init(args: string[]) {
  const dir = resolveDir(args);
  const force = hasFlag(args, '--force');
  await runInitWizard(dir, force);
}
```

Remove the now-unused imports `RELAY_CONFIG_TEMPLATE` and `INIT_NEXT_STEPS` from `./templates` (keep `RELAY_HANDLERS_TEMPLATE` if still imported anywhere in `index.ts` directly - it isn't anymore, since the wizard imports it itself, so drop the whole `./templates` import from `index.ts` and add:

```ts
import { runInitWizard } from './wizard';
```

Also remove the now-unused `writeFile`/`access` imports from `node:fs/promises` in `index.ts` if nothing else in the file uses them (check remaining usages first - `access`/`writeFile` may still be needed elsewhere; if not, drop them).

- [ ] **Step 3: Run the full CLI test suite and typecheck**

Run: `cd packages/cli && pnpm test && pnpm lint`
Expected: all PASS, no type errors.

- [ ] **Step 4: Manual verification**

Run: `cd /tmp && mkdir relay-init-smoke && cd relay-init-smoke && npm init -y && node --experimental-strip-types $(pnpm -C /Users/loveakinlesi/Projects/relayos/packages/cli bin relay 2>/dev/null || echo ../relayos/packages/cli/dist/index.js) init`

(Simplest in practice: `cd packages/cli && pnpm build && cd /tmp/relay-init-smoke && node /Users/loveakinlesi/Projects/relayos/packages/cli/dist/index.js init`.)

Expected: the wizard prompts for app name, database, plugins (Next.js prompt is skipped since this scratch dir has no `next` dependency - confirm the generic-framework path is offered instead), writes `relay.ts` reflecting the chosen database/plugins, and runs an actual install of the chosen packages with npm (since no lockfile exists in the scratch directory). Inspect the generated `relay.ts` to confirm it matches the choices made.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/wizard.ts packages/cli/src/index.ts
git commit -m "feat(cli): interactive relay init wizard (framework detection, database/plugin selection, auto-install)"
```

---

### Task 7: Update CLI docs

**Files:**

- Modify: `apps/docs/content/docs/cli/init.mdx`
- Modify: `apps/docs/content/docs/reference/cli.mdx`

**Interfaces:**

- Consumes: nothing - documentation only.

- [ ] **Step 1: Read the current content of both files before editing**

Run: `cat apps/docs/content/docs/cli/init.mdx apps/docs/content/docs/reference/cli.mdx`

- [ ] **Step 2: Update `cli/init.mdx`**

Rewrite its body to describe the interactive wizard instead of the static scaffold: mention the four prompts (app name, framework - skipped when Next.js is detected, database, plugins), that it auto-detects the package manager from the lockfile and installs the packages the choices require, and that `--force` still overwrites an existing `relay.ts`/`relay.handlers.ts`. Include a sample transcript of the prompts and the `relay.ts` it produces for a SQLite + Stripe choice (reusing `buildRelayConfigTemplate({ database: 'sqlite', plugins: ['stripe'] })`'s actual output from Task 5, so the doc and the code can't drift silently).

- [ ] **Step 3: Update `reference/cli.mdx`**

Update the `migrate`, `inspect`, `replay`, and `events list` command descriptions to say they load `relay.ts` (optionally from `--dir`) instead of reading `DATABASE_URL` - matching the `USAGE` string change from Task 4, Step 10.

- [ ] **Step 4: Build the docs app**

Run: `cd apps/docs && pnpm build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/content/docs/cli/init.mdx apps/docs/content/docs/reference/cli.mdx
git commit -m "docs: describe the interactive init wizard and relay.ts-based CLI commands"
```

---

## Self-Review

**Spec coverage:**

- Interactive wizard (app name, framework detection, database, plugins, package-manager-aware install) → Tasks 2, 5, 6.
- Next.js-only framework detection, generic fallback → Task 6.
- Package manager auto-detected from lockfile, not prompted → Task 2.
- CLI stops hardcoding a Postgres connection; every command becomes dialect-agnostic via the user's real `relay.ts` → Tasks 3, 4.
- `jiti` as the TS loader → Task 3.
- `@clack/prompts` as the prompt library → Task 6.

**Placeholder scan:** no TBDs or unimplemented steps outside Task 6's Step 4, which is explicitly a manual verification step (interactive terminal flows aren't unit-testable) rather than a placeholder for automated test code that should exist.

**Type consistency:** `PackageManager`, `DatabaseChoice`, `PluginChoice`, `loadRelay`, `resolveDir`, `buildRelayConfigTemplate`, `runInitWizard` are named identically everywhere they're used across Tasks 2-6.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-12-cli-wizard.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
