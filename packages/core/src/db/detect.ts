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
