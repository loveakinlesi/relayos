# @relayos/plugin

The RelayOS plugin authoring kit: `definePlugin` plus the webhook signature helpers (`hmacSha256Hex`, `safeEqualHex`) used by the official Stripe and GitHub plugins.

```sh
pnpm add @relayos/plugin @relayos/core
```

```ts
import { definePlugin, hmacSha256Hex, safeEqualHex } from '@relayos/plugin';

type MyEventMap = {
  'acme.order.created': { orderId: string; total: number };
};

export function acme(options: { webhookSecret: string }) {
  return definePlugin<MyEventMap>({
    id: 'acme', // mounted at /api/relay/acme
    async verify(req) {
      const signature = req.headers.get('x-acme-signature');
      if (!signature) return false;
      const expected = hmacSha256Hex(options.webhookSecret, await req.text());
      return safeEqualHex(expected, signature);
    },
    normalize(rawBody) {
      const body = rawBody as { id: string; type: string; data: Record<string, unknown> };
      return {
        id: body.id,
        type: `acme.${body.type}`,
        data: body.data,
        receivedAt: new Date().toISOString(),
      };
    },
    sign(rawBody, secret) {
      return { 'X-Acme-Signature': hmacSha256Hex(secret, rawBody) };
    },
    buildTestPayload(eventType, data) {
      return { body: { id: crypto.randomUUID(), type: eventType, data } };
    },
  });
}
```

Registering the plugin makes `relay.on('acme.order.created', ...)` autocomplete with typed `event.data`.

See the [RelayOS documentation](https://github.com/loveakinlesi/relayos#readme) for the full plugin-authoring guide.
