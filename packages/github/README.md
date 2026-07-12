# @relayos/github

The RelayOS GitHub plugin: `x-hub-signature-256` HMAC verification against the raw request body, plus a fully-typed catalog of every GitHub webhook event derived from `@octokit/webhooks-types` (GitHub's official JSON schemas).

```sh
pnpm add @relayos/github
```

```ts
// relayos.config.ts — wiring only
import { createRelay } from 'relayos';
import { github } from '@relayos/github';
import { registerHandlers } from './relayos.handlers';

export const relay = createRelay({
  plugins: [github({ webhookSecret: process.env.GITHUB_WEBHOOK_SECRET! })],
});
export type AppRelay = typeof relay;
registerHandlers(relay);
```

```ts
// relayos.handlers.ts — handler logic lives here, not in relayos.config.ts
import type { AppRelay } from './relayos.config';

export function registerHandlers(relay: AppRelay): void {
  relay.on('github.push', async (event, ctx) => {
    ctx.log.info('pushed', { ref: event.data.ref, commits: event.data.commits.length });
  });

  relay.on('github.pull_request.opened', async (event, ctx) => {
    ctx.log.info('PR opened', { number: event.data.pull_request.number });
  });
}
```

Point your GitHub webhook (JSON content type) at `/api/relay/github`. Events are namespaced `github.<event>` for action-less events (`github.push`) and `github.<event>.<action>` for action-carrying ones (`github.issues.closed`) — matching exactly what GitHub delivers. The delivery ID deduplicates redeliveries.

See the [RelayOS documentation](https://github.com/loveakinlesi/relayos#readme) for guides.
