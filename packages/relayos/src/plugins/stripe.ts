import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RelayPlugin } from '../index';

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

export function stripe(options: StripePluginOptions): RelayPlugin {
  const toleranceSeconds = options.toleranceSeconds ?? 300;

  return {
    id: 'stripe',
    async verify(req) {
      const header = req.headers.get('stripe-signature');
      if (!header) return false;

      const { timestamp, signature } = parseSignatureHeader(header);
      if (!timestamp || !signature) return false;

      const age = Math.abs(Date.now() / 1000 - Number(timestamp));
      if (!Number.isFinite(age) || age > toleranceSeconds) return false;

      const rawBody = await req.text();
      const expected = createHmac('sha256', options.webhookSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

      const expectedBuffer = Buffer.from(expected, 'hex');
      const signatureBuffer = Buffer.from(signature, 'hex');
      if (expectedBuffer.length !== signatureBuffer.length) return false;

      return timingSafeEqual(expectedBuffer, signatureBuffer);
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
  };
}
