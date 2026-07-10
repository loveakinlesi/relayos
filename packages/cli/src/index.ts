import { createDb, runMigrations } from '@relayos/postgres';

const USAGE = `Usage: relay <command>

Commands:
  migrate    Apply RelayOS's Postgres migrations (reads DATABASE_URL)
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

async function main() {
  const [, , command] = process.argv;

  switch (command) {
    case 'migrate':
      await migrate();
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
