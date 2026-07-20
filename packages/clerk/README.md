# @restaq/clerk

The Restaq Clerk plugin: Svix-style webhook verification against the raw request body, plus typed Restaq event names for common Clerk webhook events.

```sh
pnpm add @restaq/clerk
```

```ts
// relay.ts - wiring only
import { restaq as createRestaq } from 'restaq';
import { clerk } from '@restaq/clerk';
import { registerHandlers } from './relay.handlers';

export const restaq = createRestaq({
  plugins: [clerk()], // reads CLERK_WEBHOOK_SECRET automatically
});
export type AppRelay = typeof restaq;
registerHandlers(restaq);
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
