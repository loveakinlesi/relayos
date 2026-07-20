import { createHmac, timingSafeEqual } from 'node:crypto';
import { definePlugin, resolveWebhookSecret } from '@restaq/plugin';
import type { RelayPlugin } from '@restaq/core';
import type { ResendEventMap } from './events';

export type { ResendEventMap, ResendWebhookPayload } from './events';

export type ResendPluginOptions = {
  /** Defaults to process.env.RESEND_WEBHOOK_SECRET if not provided. */
  webhookSecret?: string;
  /** How old a signed timestamp can be before it's rejected, in seconds. */
  toleranceSeconds?: number;
};

function decodeSvixSecret(secret: string): string | Buffer {
  if (!secret.startsWith('whsec_')) return secret;
  return Buffer.from(secret.slice('whsec_'.length), 'base64');
}

function svixSignature(secret: string, id: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', decodeSvixSecret(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
}

function parseSvixSignatures(header: string): string[] {
  return header
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [version, signature] = part.split(',');
      return version === 'v1' ? signature : undefined;
    })
    .filter((signature): signature is string => Boolean(signature));
}

function safeEqualBase64(expectedValue: string, actualValue: string): boolean {
  const expected = Buffer.from(expectedValue);
  const actual = Buffer.from(actualValue);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function resend(options: ResendPluginOptions = {}): RelayPlugin<ResendEventMap> {
  const toleranceSeconds = options.toleranceSeconds ?? 300;

  return definePlugin<ResendEventMap>({
    id: 'resend',
    async verify(req) {
      const id = req.headers.get('svix-id');
      const timestamp = req.headers.get('svix-timestamp');
      const signatureHeader = req.headers.get('svix-signature');
      if (!id || !timestamp || !signatureHeader) return false;

      const age = Math.abs(Date.now() / 1000 - Number(timestamp));
      if (!Number.isFinite(age) || age > toleranceSeconds) return false;

      // Resolved lazily (not at resend() construction time) so commands
      // that merely load relay.ts to reach unrelated functionality (CLI's
      // migrate/inspect/events list) don't require the secret to be set -
      // only an actual signature check does.
      const webhookSecret = resolveWebhookSecret(options.webhookSecret, 'RESEND_WEBHOOK_SECRET');
      const rawBody = await req.text();
      const expected = svixSignature(webhookSecret, id, timestamp, rawBody);
      return parseSvixSignatures(signatureHeader).some((signature) =>
        safeEqualBase64(expected, signature),
      );
    },
    normalize(rawBody, headers) {
      const body = rawBody as { data?: Record<string, unknown>; type?: string };
      const data = body.data ?? {};
      return {
        id: headers.get('svix-id') ?? crypto.randomUUID(),
        type: `resend.${body.type ?? 'event'}`,
        data,
        receivedAt: new Date().toISOString(),
      };
    },
    sign(rawBody, secret) {
      const id = `msg_${crypto.randomUUID()}`;
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = svixSignature(secret, id, timestamp, rawBody);
      return {
        'Svix-Id': id,
        'Svix-Timestamp': timestamp,
        'Svix-Signature': `v1,${signature}`,
      };
    },
    buildTestPayload(eventType, data) {
      return {
        body: {
          created_at: new Date().toISOString(),
          data,
          type: eventType,
        },
      };
    },
  });
}
