import { definePlugin, hmacSha256Hex, safeEqualHex } from '@relayos/plugin';
import type { RelayPlugin } from '@relayos/core';
import type { GitHubEventMap } from './events';

export type { GitHubEventMap } from './events';

export type GitHubPluginOptions = {
  webhookSecret: string;
};

export function github(options: GitHubPluginOptions): RelayPlugin<GitHubEventMap> {
  return definePlugin<GitHubEventMap>({
    id: 'github',
    async verify(req) {
      const header = req.headers.get('x-hub-signature-256');
      if (!header) return false;

      const [algo, signature] = header.split('=');
      if (algo !== 'sha256' || !signature) return false;

      const rawBody = await req.text();
      const expected = hmacSha256Hex(options.webhookSecret, rawBody);
      return safeEqualHex(expected, signature);
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
      const signature = hmacSha256Hex(secret, rawBody);
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
  });
}
