import { createHmac, timingSafeEqual } from 'node:crypto';
import { definePlugin, resolveWebhookSecret } from '@restaq/plugin';
import type { RelayPlugin } from '@restaq/core';
import type { ShopifyEventMap } from './events';

export type { ShopifyEventMap, ShopifyWebhookPayload } from './events';

export type ShopifyPluginOptions = {
  /** Defaults to process.env.SHOPIFY_WEBHOOK_SECRET if not provided. */
  webhookSecret?: string;
};

function shopifySignature(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64');
}

function safeEqualString(expectedValue: string, actualValue: string): boolean {
  const expected = Buffer.from(expectedValue);
  const actual = Buffer.from(actualValue);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function normalizeTopic(topic: string): string {
  return topic.replaceAll('/', '.');
}

export function shopify(options: ShopifyPluginOptions = {}): RelayPlugin<ShopifyEventMap> {
  return definePlugin<ShopifyEventMap>({
    id: 'shopify',
    async verify(req) {
      const signature = req.headers.get('x-shopify-hmac-sha256');
      if (!signature) return false;

      // Resolved lazily (not at shopify() construction time) so commands
      // that merely load relay.ts to reach unrelated functionality (CLI's
      // migrate/inspect/events list) don't require the secret to be set -
      // only an actual signature check does.
      const webhookSecret = resolveWebhookSecret(options.webhookSecret, 'SHOPIFY_WEBHOOK_SECRET');
      const rawBody = await req.text();
      const expected = shopifySignature(webhookSecret, rawBody);
      return safeEqualString(expected, signature);
    },
    normalize(rawBody, headers) {
      const body = rawBody as Record<string, unknown>;
      const topic = headers.get('x-shopify-topic') ?? 'event';
      const webhookId = headers.get('x-shopify-webhook-id');
      return {
        id: webhookId ?? crypto.randomUUID(),
        type: `shopify.${normalizeTopic(topic)}`,
        data: body,
        receivedAt: new Date().toISOString(),
      };
    },
    sign(rawBody, secret) {
      return { 'X-Shopify-Hmac-Sha256': shopifySignature(secret, rawBody) };
    },
    buildTestPayload(eventType, data) {
      return {
        body: data,
        headers: {
          'X-Shopify-Topic': eventType.replaceAll('.', '/'),
          'X-Shopify-Webhook-Id': crypto.randomUUID(),
        },
      };
    },
  });
}
