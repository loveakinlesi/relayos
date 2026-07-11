import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { gt } from 'drizzle-orm';
import { createDb, createPostgresExecutionStore, executions, runMigrations } from '@relayos/postgres';
import type { Execution, ExecutionStore, RelayPlugin } from 'relayos';
import { stripe } from 'relayos/plugins/stripe';
import { github } from 'relayos/plugins/github';
import { getFlag, hasFlag, resolveRuntimeUrl, statusIcon, formatDuration, latestStepsByName } from './utils';

const USAGE = `Usage: relay <command>

Commands:
  migrate                                Apply RelayOS's Postgres migrations (reads DATABASE_URL)
  dev [--dir <path>]                      Run the app's dev server and tail new executions live
                                          (tailing requires DATABASE_URL; --dir defaults to cwd)
  trigger <provider> <eventType>          Simulate a signed provider webhook delivery
    [--data '<json>'] [--forward <url>]   (reads <PROVIDER>_WEBHOOK_SECRET; --forward defaults to
                                          RELAYOS_RUNTIME_URL or http://localhost:3000)
  inspect <eventId|executionId>           Show an execution's status, steps, and logs
    [--json] [--history]                  (reads DATABASE_URL directly, no running app needed)
  replay <eventId|executionId>            Replay a historical execution as a new one
    [--forward <url>]                     (resolves via DATABASE_URL, replays via --forward)

Planned, not yet available: relay resume <id>, relay stop <id>, relay progress <id>,
relay events list - see TODOs in packages/cli/src/index.ts.
`;

// TODO: relay resume <id> / relay stop <id> / relay progress <id> - deferred.
// These need SDK-level capabilities that don't exist yet: a distinct "resume"
// beyond retryExecution/restartExecution, real "stop" semantics (halt an
// execution permanently, including any pending scheduled retry), and a
// per-execution "progress" concept beyond what inspect already shows via
// steps/logs. relay events list is nearly free (wraps listExecutions()) but
// deferred to land alongside the others rather than piecemeal.

function requireDatabaseUrl(): string | undefined {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('DATABASE_URL must be set.');
    process.exitCode = 1;
    return undefined;
  }
  return connectionString;
}

async function resolveExecution(store: ExecutionStore, id: string): Promise<Execution | undefined> {
  return (await store.findByEventId(id)) ?? (await store.get(id));
}

async function migrate() {
  const connectionString = requireDatabaseUrl();
  if (!connectionString) return;

  const db = createDb(connectionString);
  console.log('Applying RelayOS migrations...');
  await runMigrations(db);
  console.log('Migrations applied.');
}

async function dev(args: string[]) {
  const dirFlagIndex = args.indexOf('--dir');
  const dirArg = dirFlagIndex !== -1 ? args[dirFlagIndex + 1] : undefined;
  const dir = dirArg ? resolve(dirArg) : process.cwd();

  console.log(`[relay dev] starting dev server in ${dir}`);
  // detached + killing the negative pid signals the whole process group, not
  // just this immediate child - "pnpm run dev" spawns its own children (e.g.
  // "next dev" spawns "next-server"), and child.kill() alone would leave
  // those grandchildren running as orphans after Ctrl+C.
  const child = spawn('pnpm', ['run', 'dev'], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
  });

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

  const shutdown = () => {
    if (watcher) clearInterval(watcher);
    if (child.pid && process.platform !== 'win32') {
      process.kill(-child.pid, 'SIGTERM');
    } else {
      child.kill();
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise<void>((resolveExit) => {
    child.on('exit', (code) => {
      if (watcher) clearInterval(watcher);
      process.exitCode = code ?? 0;
      resolveExit();
    });
  });
}

const providerFactories: Record<string, (secret: string) => RelayPlugin> = {
  stripe: (secret) => stripe({ webhookSecret: secret }),
  github: (secret) => github({ webhookSecret: secret }),
};

async function trigger(args: string[]) {
  const [provider, eventType] = args;
  if (!provider || !eventType) {
    console.error("Usage: relay trigger <provider> <eventType> [--data '<json>'] [--forward <url>]");
    process.exitCode = 1;
    return;
  }

  const factory = providerFactories[provider];
  if (!factory) {
    console.error(
      `Unknown provider "${provider}". Available: ${Object.keys(providerFactories).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  const secretEnvVar = `${provider.toUpperCase()}_WEBHOOK_SECRET`;
  const secret = process.env[secretEnvVar];
  if (!secret) {
    console.error(`${secretEnvVar} must be set.`);
    process.exitCode = 1;
    return;
  }

  const dataFlag = getFlag(args, '--data');
  let data: Record<string, unknown> = {};
  if (dataFlag) {
    try {
      data = JSON.parse(dataFlag) as Record<string, unknown>;
    } catch (err) {
      console.error('Failed to parse --data as JSON:', err);
      process.exitCode = 1;
      return;
    }
  }

  const plugin = factory(secret);
  const { body, headers: envelopeHeaders } = plugin.buildTestPayload(eventType, data);
  const rawBody = JSON.stringify(body);
  const signatureHeaders = plugin.sign(rawBody, secret);

  const url = resolveRuntimeUrl(args);
  const target = `${url}/api/relay/${provider}`;

  console.log(`[relay trigger] POST ${target}`);
  const response = await fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...envelopeHeaders,
      ...signatureHeaders,
    },
    body: rawBody,
  });

  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    console.error(`[relay trigger] ${response.status} ${response.statusText}`, json ?? '');
    process.exitCode = 1;
    return;
  }
  console.log(`[relay trigger] ${response.status}`, JSON.stringify(json, null, 2));
}

async function inspect(args: string[]) {
  const [id] = args;
  if (!id) {
    console.error('Usage: relay inspect <eventId|executionId> [--json] [--history]');
    process.exitCode = 1;
    return;
  }

  const connectionString = requireDatabaseUrl();
  if (!connectionString) return;

  const db = createDb(connectionString);
  const store = createPostgresExecutionStore(db);
  const execution = await resolveExecution(store, id);
  if (!execution) {
    console.error(`No execution found matching "${id}" (checked eventId and execution id).`);
    process.exitCode = 1;
    return;
  }

  const steps = await store.listSteps(execution.id);
  const logs = await store.listLogs(execution.id);

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify({ execution, steps, logs }, null, 2));
    return;
  }

  const showHistory = hasFlag(args, '--history');

  console.log(`Execution ${execution.id}`);
  console.log(`  event:      ${execution.eventType} (${execution.eventId})`);
  console.log(
    `  status:     ${statusIcon(execution.status)} ${execution.status} (attempt ${execution.attempt})`,
  );
  console.log(`  duration:   ${formatDuration(execution.createdAt, execution.completedAt)}`);
  if (execution.replayedFrom) {
    console.log(`  replayed from: ${execution.replayedFrom}`);
  }
  if (execution.error) {
    console.log(`  error:      ${execution.error}`);
  }

  const displaySteps = showHistory ? steps : latestStepsByName(steps);
  console.log(`\nSteps${showHistory ? ' (full history)' : ''}:`);
  if (displaySteps.length === 0) {
    console.log('  (none)');
  }
  for (const step of displaySteps) {
    console.log(
      `  ${statusIcon(step.status)} ${step.name} ${step.status}${step.error ? ` - ${step.error}` : ''}`,
    );
  }

  console.log('\nLogs:');
  if (logs.length === 0) {
    console.log('  (none)');
  }
  for (const log of logs) {
    console.log(`  [${log.source}] [${log.level}] ${log.message}`);
  }
}

async function replay(args: string[]) {
  const [id] = args;
  if (!id) {
    console.error('Usage: relay replay <eventId|executionId> [--forward <url>]');
    process.exitCode = 1;
    return;
  }

  // TODO: --print - dry-run mode that resolves and prints what would be
  // replayed (source execution's event type/data) without making the HTTP
  // call. Deferred; needs no new SDK support, just CLI-side formatting.

  const connectionString = requireDatabaseUrl();
  if (!connectionString) return;

  const db = createDb(connectionString);
  const store = createPostgresExecutionStore(db);
  const execution = await resolveExecution(store, id);
  if (!execution) {
    console.error(`No execution found matching "${id}" (checked eventId and execution id).`);
    process.exitCode = 1;
    return;
  }

  const url = resolveRuntimeUrl(args);
  const target = `${url}/api/executions/${execution.id}/replay`;

  console.log(`[relay replay] POST ${target}`);
  const response = await fetch(target, { method: 'POST' });
  const json: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    console.error(`[relay replay] ${response.status} ${response.statusText}`, json ?? '');
    process.exitCode = 1;
    return;
  }
  console.log(`[relay replay] ${response.status}`, JSON.stringify(json, null, 2));
}

async function main() {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case 'migrate':
      await migrate();
      return;
    case 'dev':
      await dev(rest);
      return;
    case 'trigger':
      await trigger(rest);
      return;
    case 'inspect':
      await inspect(rest);
      return;
    case 'replay':
      await replay(rest);
      return;
    case undefined:
    case '--help':
    case '-h':
      console.log(USAGE);
      return;
    default:
      console.error(`Unknown command "${command}".\n\n${USAGE}`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
