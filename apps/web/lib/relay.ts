import { createRelay, type RelayPlugin } from 'relayos';
import { stripe } from 'relayos/plugins/stripe';
import { createDb, createPostgresExecutionStore } from '@relayos/postgres';

const isProduction = process.env.NODE_ENV === 'production';

const db = createDb(process.env.DATABASE_URL ?? 'postgres://localhost:5432/relayos_dev');

function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret) return secret;
  if (isProduction) {
    throw new Error('STRIPE_WEBHOOK_SECRET must be set in production');
  }
  return 'whsec_test_secret';
}

/**
 * Dev/test-only pass-through provider: no signature check. Never registered in
 * production, and event types are always forced under the "test." namespace so
 * it can never mint events that spoof a real provider (e.g. "stripe.*").
 */
const testPlugin: RelayPlugin = {
  id: 'test',
  async verify() {
    return true;
  },
  normalize(rawBody) {
    const body = rawBody as { id?: string; type?: string; data?: Record<string, unknown> };
    const suffix = (body.type ?? 'ping').replace(/^test\./, '');
    return {
      id: body.id ?? crypto.randomUUID(),
      type: `test.${suffix}`,
      data: body.data ?? {},
      receivedAt: new Date().toISOString(),
    };
  },
};

const plugins: RelayPlugin[] = [stripe({ webhookSecret: getStripeWebhookSecret() })];
if (!isProduction) {
  plugins.unshift(testPlugin);
}

export const relay = createRelay({
  database: createPostgresExecutionStore(db),
  plugins,
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
