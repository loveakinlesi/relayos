import { spawn } from 'node:child_process';
import type { Execution, Relay, RelayPlugin } from '@relayos/core';
import { stripe } from '@relayos/stripe';
import { github } from '@relayos/github';
import { loadRelay } from './load-relay';
import { runInitWizard } from './wizard';
import {
  getFlag,
  hasFlag,
  resolveBaseUrl,
  resolveDir,
  statusIcon,
  formatDuration,
  latestStepsByName,
} from './utils';

const USAGE = `Usage: relay <command>

Commands:
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

Planned, not yet available: relay resume <id>, relay stop <id>, relay progress <id> -
see the TODO comment near main() in packages/cli/src/index.ts.
`;

// TODO: relay resume <id> / relay stop <id> / relay progress <id> - deferred.
// These need SDK-level capabilities that don't exist yet: a distinct "resume"
// beyond retryExecution/restartExecution, real "stop" semantics (halt an
// execution permanently, including any pending scheduled retry - which needs
// the runtime to track cancellable timer handles, not just fire-and-forget
// setTimeout calls, since nothing today can cancel a scheduled retry), and a
// per-execution "progress" concept beyond what inspect already shows via
// steps/logs.

async function resolveExecution(relay: Relay, id: string): Promise<Execution | undefined> {
  const all = await relay.listExecutions();
  return all.find((execution) => execution.eventId === id) ?? all.find((execution) => execution.id === id);
}

async function init(args: string[]) {
  const dir = resolveDir(args);
  const force = hasFlag(args, '--force');
  await runInitWizard(dir, force);
}

async function migrate(args: string[]) {
  const relay = await loadRelay(resolveDir(args));
  console.log('Applying RelayOS migrations...');
  await relay.migrate();
  console.log('Migrations applied.');
}

async function dev(args: string[]) {
  const dir = resolveDir(args);

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
    console.log(`[relay dev] ${err instanceof Error ? err.message : String(err)} - skipping live execution feed`);
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
    console.error(
      "Usage: relay trigger <provider> <eventType> [--data '<json>'] [--forward <url>]",
    );
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

  const url = resolveBaseUrl(args);
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

  const relay = await loadRelay(resolveDir(args));
  const execution = await resolveExecution(relay, id);
  if (!execution) {
    console.error(`No execution found matching "${id}" (checked eventId and execution id).`);
    process.exitCode = 1;
    return;
  }

  const steps = await relay.listSteps(execution.id);
  const logs = await relay.listLogs(execution.id);

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
    console.error('Usage: relay replay <eventId|executionId> [--forward <url>] [--print]');
    process.exitCode = 1;
    return;
  }

  const relay = await loadRelay(resolveDir(args));
  const execution = await resolveExecution(relay, id);
  if (!execution) {
    console.error(`No execution found matching "${id}" (checked eventId and execution id).`);
    process.exitCode = 1;
    return;
  }

  if (hasFlag(args, '--print')) {
    console.log('Would replay (dry run - no request sent, nothing was replayed):');
    console.log(`  source execution: ${execution.id}`);
    console.log(`  event type:       ${execution.eventType}`);
    console.log(`  event data:       ${JSON.stringify(execution.eventData, null, 2)}`);
    return;
  }

  const url = resolveBaseUrl(args);
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

async function eventsList(args: string[]) {
  const relay = await loadRelay(resolveDir(args));
  const all = await relay.listExecutions();

  const limitFlag = getFlag(args, '--limit');
  const limit = limitFlag ? Number(limitFlag) : undefined;
  const rows = limit !== undefined && Number.isFinite(limit) ? all.slice(0, limit) : all;

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log('(no executions)');
    return;
  }

  for (const execution of rows) {
    console.log(
      `${statusIcon(execution.status)} ${execution.eventType.padEnd(28)} attempt ${execution.attempt}  ${execution.createdAt}  ${execution.id}`,
    );
  }
}

async function events(args: string[]) {
  const [subcommand, ...rest] = args;
  if (subcommand !== 'list') {
    console.error('Usage: relay events list [--json] [--limit <n>]');
    process.exitCode = 1;
    return;
  }
  await eventsList(rest);
}

async function main() {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case 'init':
      await init(rest);
      return;
    case 'migrate':
      await migrate(rest);
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
    case 'events':
      await events(rest);
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
