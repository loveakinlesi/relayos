# @restaq/github

The Restaq GitHub plugin: `x-hub-signature-256` HMAC verification against the raw request body, plus a fully-typed catalog of every GitHub webhook event derived from `@octokit/webhooks-types` (GitHub's official JSON schemas).

```sh
pnpm add @restaq/github
```

```ts
// relay.ts — wiring only
import { restaq as createRestaq } from 'restaq';
import { github } from '@restaq/github';
import { registerHandlers } from './relay.handlers';

export const restaq = createRestaq({
  plugins: [github()], // reads GITHUB_WEBHOOK_SECRET automatically
});
export type AppRelay = typeof restaq;
registerHandlers(restaq);
```

```ts
// relay.handlers.ts — handler logic lives here, not in relay.ts
import type { AppRelay } from './relay';

export function registerHandlers(relay: AppRelay): void {
  relay.on('github.push', async (event, ctx) => {
    ctx.log.info('pushed', { ref: event.data.ref, commits: event.data.commits.length });
  });

  relay.on('github.pull_request.opened', async (event, ctx) => {
    ctx.log.info('PR opened', { number: event.data.pull_request.number });
  });
}
```

Point your GitHub webhook (JSON content type) at `/api/webhook/github`. Events are namespaced `github.<event>` for action-less events (`github.push`) and `github.<event>.<action>` for action-carrying ones (`github.issues.closed`) — matching exactly what GitHub delivers. The delivery ID deduplicates redeliveries.

See the [Restaq documentation](https://github.com/loveakinlesi/restaq#readme) for guides.
