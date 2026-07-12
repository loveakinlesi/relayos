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
