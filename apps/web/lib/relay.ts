import { createRelay, type RelayPlugin } from 'relayos';
import { stripe } from 'relayos/plugins/stripe';
import { createDb, createPostgresExecutionStore } from '@relayos/postgres';

const db = createDb(process.env.DATABASE_URL ?? 'postgres://localhost:5432/relayos_dev');

/** Dev-only pass-through provider: no signature check, body maps straight to a NormalizedEvent. */
const testPlugin: RelayPlugin = {
  id: 'test',
  async verify() {
    return true;
  },
  normalize(rawBody) {
    const body = rawBody as { id?: string; type?: string; data?: Record<string, unknown> };
    return {
      id: body.id ?? crypto.randomUUID(),
      type: body.type ?? 'test.ping',
      data: body.data ?? {},
      receivedAt: new Date().toISOString(),
    };
  },
};

export const relay = createRelay({
  database: createPostgresExecutionStore(db),
  plugins: [
    testPlugin,
    stripe({ webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_secret' }),
  ],
});

relay.on('test.ping', async (event) => {
  console.log('[relayos] handled test.ping', event);
});

relay.on('test.fail', async () => {
  throw new Error('simulated handler failure');
});

relay.on('stripe.charge.succeeded', async (event) => {
  console.log('[relayos] handled stripe.charge.succeeded', event);
});
