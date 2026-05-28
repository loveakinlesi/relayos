import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export interface DatabaseClient {
  db: Database;
  close: () => Promise<void>;
}

export function createDatabase(connectionString: string): DatabaseClient {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return {
    db,
    close: () => pool.end(),
  };
}
