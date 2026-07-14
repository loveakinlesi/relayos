# @relayos/clerk

The RelayOS Clerk plugin: Svix-style webhook verification against the raw request body, plus typed RelayOS event names for common Clerk webhook events.

```sh
pnpm add @relayos/clerk
```

```ts
// relay.ts - wiring only
import { relayos } from 'relayos';
import { clerk } from '@relayos/clerk';
import { registerHandlers } from './relay.handlers';

export const relay = relayos({
  plugins: [clerk()], // reads CLERK_WEBHOOK_SECRET automatically
});
export type AppRelay = typeof relay;
registerHandlers(relay);
```

```ts
// relay.handlers.ts
import type { AppRelay } from './relay';

export function registerHandlers(relay: AppRelay): void {
  relay.on('clerk.user.created', async (event, ctx) => {
    ctx.log.info('user created', { id: event.data.id });
  });
}
```

Point your Clerk webhook endpoint at `/api/webhook/clerk`. Events are namespaced `clerk.<event type>` (`clerk.user.created`, `clerk.organization.created`, ...). Signatures are verified with a timestamp tolerance of 300 seconds by default (`toleranceSeconds` option).
