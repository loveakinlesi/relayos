import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client';

// Migrations ship alongside dist/ (see package.json "files"), so this
// resolves correctly both inside the monorepo and as an installed package.
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
