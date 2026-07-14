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
      // Not destroyed after use: this Kysely instance and the store's share
      // the same underlying client/pool (the one the caller passed into
      // `database`), and destroying a Kysely instance closes that
      // underlying connection - which would break every subsequent store
      // query, not just this migration run.
      const rawDb = new Kysely<any>({ dialect });
      await migrateToLatest(rawDb, name);
    },
  };
}
