import { relayos, type RelayPlugin } from 'relayos';
import { stripe } from '@relayos/stripe';
import { github } from '@relayos/github';
import { Pool } from 'pg';
import { registerHandlers } from './relay.handlers';

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://localhost:5432/relayos_dev',
});

function requireWebhookSecret(envVar: string, devFallback: string): string {
  const secret = process.env[envVar];
  if (secret) return secret;
  if (isProduction) {
    throw new Error(`${envVar} must be set in production`);
  }
  return devFallback;
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
  sign() {
    return {};
  },
  buildTestPayload(eventType, data) {
    return { body: { type: eventType, data } };
  },
};

// The plugins array is inlined (not pre-annotated as RelayPlugin[]) so
// relayos() can infer the typed event maps from the stripe/github plugins:
// relay.on() autocompletes their event names and types event.data per event.
export const relay = relayos({
  database: pool,
  plugins: [
    ...(isProduction ? [] : [testPlugin]),
    stripe({ webhookSecret: requireWebhookSecret('STRIPE_WEBHOOK_SECRET', 'whsec_test_secret') }),
    github({ webhookSecret: requireWebhookSecret('GITHUB_WEBHOOK_SECRET', 'ghsec_test_secret') }),
  ],
});

// The concrete relay type, including the typed event catalog inferred from
// the plugins above - exported so relay.handlers.ts can register handlers
// with full event.data typing without re-deriving the plugins list.
export type AppRelay = typeof relay;

// Handler registration lives in its own module, not inline here - this file
// stays wiring-only: storage, plugins, retry policy.
registerHandlers(relay);
