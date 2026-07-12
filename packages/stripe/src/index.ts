import { definePlugin, hmacSha256Hex, safeEqualHex } from '@relayos/plugin';
import type { RelayPlugin } from '@relayos/core';
import type { StripeEventMap } from './events';

export type { StripeEventMap } from './events';

export type StripePluginOptions = {
  webhookSecret: string;
  /** How old a signed timestamp can be before it's rejected, in seconds. */
  toleranceSeconds?: number;
};

function parseSignatureHeader(header: string): { timestamp?: string; signature?: string } {
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    }),
  );
  return { timestamp: parts.t, signature: parts.v1 };
}

export function stripe(options: StripePluginOptions): RelayPlugin<StripeEventMap> {
  const toleranceSeconds = options.toleranceSeconds ?? 300;

  return definePlugin<StripeEventMap>({
    id: 'stripe',
    async verify(req) {
      const header = req.headers.get('stripe-signature');
      if (!header) return false;

      const { timestamp, signature } = parseSignatureHeader(header);
      if (!timestamp || !signature) return false;

      const age = Math.abs(Date.now() / 1000 - Number(timestamp));
      if (!Number.isFinite(age) || age > toleranceSeconds) return false;

      const rawBody = await req.text();
      const expected = hmacSha256Hex(options.webhookSecret, `${timestamp}.${rawBody}`);
      return safeEqualHex(expected, signature);
    },
    normalize(rawBody) {
      const body = rawBody as { id: string; type: string; data: Record<string, unknown> };
      return {
        id: body.id,
        type: `stripe.${body.type}`,
        data: body.data ?? {},
        receivedAt: new Date().toISOString(),
      };
    },
    sign(rawBody, secret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
      return { 'Stripe-Signature': `t=${timestamp},v1=${signature}` };
    },
    buildTestPayload(eventType, data) {
      return {
        body: {
          id: `evt_${crypto.randomUUID()}`,
          type: eventType,
          data: { object: data },
        },
      };
    },
  });
}
