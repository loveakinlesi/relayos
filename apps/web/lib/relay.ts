import { createRelay } from 'relayos';
import { createDb, createPostgresExecutionStore } from '@relayos/postgres';

const db = createDb(process.env.DATABASE_URL ?? 'postgres://localhost:5432/relayos_dev');

export const relay = createRelay({ store: createPostgresExecutionStore(db) });

relay.on('test.ping', async (event) => {
  console.log('[relayos] handled test.ping', event);
});

relay.on('test.fail', async () => {
  throw new Error('simulated handler failure');
});
