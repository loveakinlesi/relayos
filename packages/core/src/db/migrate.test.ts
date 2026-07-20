import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, sql } from 'kysely';
import { migrateToLatest } from './migrate';

describe('migrateToLatest (sqlite)', () => {
  let db: Kysely<any> | undefined;

  afterEach(async () => {
    await db?.destroy();
  });

  it('creates the three restaq tables', async () => {
    db = new Kysely({ dialect: new SqliteDialect({ database: new Database(':memory:') }) });
    await migrateToLatest(db, 'sqlite');

    const tables = await sql<{ name: string }>`
      select name from sqlite_master where type = 'table' and name like 'restaq_%'
    `.execute(db);
    const names = tables.rows.map((row) => row.name).sort();
    expect(names).toEqual([
      'restaq_execution_logs',
      'restaq_execution_steps',
      'restaq_executions',
      'restaq_migrations',
    ]);
  });

  it('records the migration name in restaq_migrations', async () => {
    db = new Kysely({ dialect: new SqliteDialect({ database: new Database(':memory:') }) });
    await migrateToLatest(db, 'sqlite');

    const applied = await db.selectFrom('restaq_migrations').select('name').execute();
    expect(applied.map((row) => row.name)).toEqual(['001_initial']);
  });

  it('is idempotent - running it twice does not error or duplicate the tracking row', async () => {
    db = new Kysely({ dialect: new SqliteDialect({ database: new Database(':memory:') }) });
    await migrateToLatest(db, 'sqlite');
    await expect(migrateToLatest(db, 'sqlite')).resolves.not.toThrow();

    const applied = await db.selectFrom('restaq_migrations').select('name').execute();
    expect(applied).toHaveLength(1);
  });
});
