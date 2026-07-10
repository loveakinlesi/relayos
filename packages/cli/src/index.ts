import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { gt } from 'drizzle-orm';
import { createDb, executions, runMigrations } from '@relayos/postgres';

const USAGE = `Usage: relay <command>

Commands:
  migrate            Apply RelayOS's Postgres migrations (reads DATABASE_URL)
  dev [--dir <path>]  Run the app's dev server and tail new executions live
                      (tailing requires DATABASE_URL; --dir defaults to cwd)
`;

async function migrate() {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('DATABASE_URL must be set.');
    process.exitCode = 1;
    return;
  }

  const db = createDb(connectionString);
  console.log('Applying RelayOS migrations...');
  await runMigrations(db);
  console.log('Migrations applied.');
}

function statusIcon(status: string): string {
  if (status === 'completed') return '✔';
  if (status === 'failed') return '✖';
  return '…';
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

async function main() {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case 'migrate':
      await migrate();
      return;
    case 'dev':
      await dev(rest);
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
