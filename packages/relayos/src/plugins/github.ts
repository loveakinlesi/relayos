import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RelayPlugin } from '../index';

export type GitHubPluginOptions = {
  webhookSecret: string;
};

export function github(options: GitHubPluginOptions): RelayPlugin {
  return {
    id: 'github',
    async verify(req) {
      const header = req.headers.get('x-hub-signature-256');
      if (!header) return false;

      const [algo, signature] = header.split('=');
      if (algo !== 'sha256' || !signature) return false;

      const rawBody = await req.text();
      const expected = createHmac('sha256', options.webhookSecret).update(rawBody).digest('hex');

      const expectedBuffer = Buffer.from(expected, 'hex');
      const signatureBuffer = Buffer.from(signature, 'hex');
      if (expectedBuffer.length !== signatureBuffer.length) return false;

      return timingSafeEqual(expectedBuffer, signatureBuffer);
    },
    normalize(rawBody, headers) {
      const body = rawBody as { action?: string };
      const eventName = headers.get('x-github-event') ?? 'event';
      const deliveryId = headers.get('x-github-delivery') ?? crypto.randomUUID();
      const type = body.action ? `github.${eventName}.${body.action}` : `github.${eventName}`;

      return {
        id: deliveryId,
        type,
        data: rawBody as Record<string, unknown>,
        receivedAt: new Date().toISOString(),
      };
    },
    sign(rawBody, secret) {
      const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
      return { 'X-Hub-Signature-256': `sha256=${signature}` };
    },
    buildTestPayload(eventType, data) {
      // GitHub has no "type" field in the body - the event name is a header,
      // and sub-events (e.g. "pull_request.opened") carry the action in the
      // body itself, so "push" and "pull_request.opened" both need parsing.
      const [eventName, action] = eventType.split('.');
      return {
        body: action ? { ...data, action } : data,
        headers: {
          'X-GitHub-Event': eventName ?? eventType,
          'X-GitHub-Delivery': crypto.randomUUID(),
        },
      };
    },
  };
}
