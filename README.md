# RelayOS

**RelayOS is a durable webhook execution platform that helps developers build reliable, replayable, and observable event-driven backends.**

Receiving a webhook is easy. Reliably processing everything that has to happen _after_ it — retrying the parts that failed, not re-running the parts that didn't, replaying a historical event to debug it, seeing exactly what happened and why — is the hard part. RelayOS is the runtime for that.

|             | Category                       |
| ----------- | ------------------------------ |
| Better Auth | Authentication framework       |
| Drizzle     | ORM                            |
| Hono        | Web framework                  |
| **RelayOS** | **Webhook execution platform** |

## Why

Webhook handlers are usually a pile of `if` statements with no memory of what already happened. A provider retries, and you double-charge a customer. A step three-quarters through a handler fails, and you re-run everything from scratch — or worse, nothing at all, silently. Debugging means grepping logs, because there's no record of what actually executed.

RelayOS gives you:

- **Durable steps** — `ctx.step.run(name, fn)` checkpoints each unit of work. A retry resumes past whatever already succeeded; it never re-runs a completed step's side effects.
- **Automatic retries** — a failed execution schedules its own retry with exponential backoff, up to a configurable cap, with no polling or queue infrastructure to run.
- **Replay & restart** — `retryExecution` resumes in place, `restartExecution` forces every step to re-run (for when the step logic itself was wrong, not just flaky), and `replayExecution` reprocesses a historical event as a brand-new execution without touching the original.
- **A real audit trail** — every step attempt is a new row, never overwritten, so a step that failed twice before succeeding shows all three attempts. Every execution's log stream interleaves the runtime's own lifecycle events (`retrying (attempt 2, scheduled)`) with your handler's own logging, tagged so you can tell them apart.
- **Provider adapters with real signature verification** — Stripe and GitHub today, each doing actual HMAC verification against the raw request body, not a stub.
- **Fully-typed event catalogs** — `relay.on('stripe.charge.succeeded', ...)` autocompletes every event of the plugins you registered, and `event.data` is typed per event (`event.data.object` is a real `Stripe.Charge`).
- **A dedicated Postgres schema** — RelayOS's tables live under their own `relayos` schema, not `public`, so they never collide with your application's own tables.
- **First-class local dev tooling** — `relay migrate` applies the schema with one command; `relay dev` runs your app and tails live execution activity to the terminal.

## Quickstart

```sh
pnpm add relayos
```

That's the entire install — no database, no provider plugin, no framework adapter required. `relayos` ships an in-memory store and Next.js support (`relayos/next-js`) out of the box.

```ts
// relayos.config.ts — wiring only
import { createRelay } from 'relayos';
import { registerHandlers } from './relayos.handlers';

export const relay = createRelay();
export type AppRelay = typeof relay; // carries the typed event catalog forward
registerHandlers(relay);
```

```ts
// relayos.handlers.ts — handler logic lives here, not in relayos.config.ts
import type { AppRelay } from './relayos.config';

export function registerHandlers(relay: AppRelay): void {
  relay.on('order.placed', async (event, ctx) => {
    const payment = await ctx.step.run('charge-payment', async () => {
      return { orderId: event.data.orderId, amount: event.data.amount };
    });

    await ctx.step.run('send-confirmation', async () => {
      ctx.log.info('order confirmed', payment);
    });
  });
}
```

```ts
// try it — no HTTP, no plugin, no database
import { relay } from './relayos.config';

const execution = await relay.ingest({
  id: crypto.randomUUID(),
  type: 'order.placed',
  data: { orderId: 'ord_1', amount: 4200 },
  receivedAt: new Date().toISOString(),
});

console.log(execution.status); // "completed" — charge-payment never re-runs on retry
```

From here: `pnpm add @relayos/stripe stripe` (or `@relayos/github`) once you're ready to receive real, signature-verified webhooks; `pnpm add @relayos/postgres` once you need executions to survive a restart; `import { toNextJsHandler } from 'relayos/next-js'` to mount as a Next.js route — nothing extra to install for that last one. See `apps/docs` (`pnpm --filter docs dev`, served on `:3001`) for the full quickstart and API reference.

## Packages

This is a Turborepo monorepo:

| Package                                    | Purpose                                                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`relayos`](./packages/relayos)            | The SDK: `createRelay`, the user-facing types, and Next.js support (`relayos/next-js`). The only required install — ships an in-memory store by default.                     |
| [`@relayos/core`](./packages/core)         | The engine: durable executions, steps, retries, replay, and the contracts (`ExecutionStore`, `RelayPlugin`) everything else builds on. Pulled in automatically by `relayos`. |
| [`@relayos/plugin`](./packages/plugin)     | Plugin authoring kit: `definePlugin` + webhook signature helpers for building your own providers. Optional.                                                                  |
| [`@relayos/stripe`](./packages/stripe)     | Stripe plugin: signature verification + a fully-typed catalog of every Stripe event (peer-depends on `stripe`). Optional.                                                    |
| [`@relayos/github`](./packages/github)     | GitHub plugin: signature verification + a fully-typed catalog of every GitHub webhook event. Optional.                                                                       |
| [`@relayos/postgres`](./packages/postgres) | The Postgres storage adapter: schema, migrations, and the `ExecutionStore` implementation. Optional — add once you need durability.                                          |
| [`@relayos/cli`](./packages/cli)           | `relay init`, `relay migrate`, `relay dev`, `relay trigger`, `relay inspect`, `relay replay`, `relay events list`.                                                           |
| [`apps/web`](./apps/web)                   | A Next.js app used as the local dev/test harness for the runtime, wired up in `apps/web/relayos.config.ts`.                                                                  |
| [`apps/docs`](./apps/docs)                 | The documentation site (Fumadocs). `pnpm --filter docs dev` serves it on port 3001.                                                                                          |

## Local Development

Setting up this monorepo (not just consuming the published packages) to hack on the runtime itself:

**1. Prerequisites**

- Node >=20, pnpm >=9
- A local Postgres (for running `apps/web`). Separately, running `@relayos/postgres`'s tests wants a container runtime (Docker, Colima, or Podman) — see [Testing](#testing) below if you don't have one.

**2. Clone the repo:**

```sh
git clone <repo-url> && cd relayos
pnpm install
```

**3. Create a database and apply migrations:**

```sh
createdb relayos_dev   # or: psql -c "CREATE DATABASE relayos_dev"
DATABASE_URL=postgres://localhost:5432/relayos_dev pnpm exec relay migrate
```

This creates the `relayos` schema and its tables. `relay` won't be on your `$PATH` the first time — `pnpm install` links it into the workspace root's `node_modules/.bin`, so `pnpm exec relay ...` (or `pnpm exec` from any workspace package) always resolves it.

**4. Build everything once:**

```sh
STRIPE_WEBHOOK_SECRET=whsec_dev GITHUB_WEBHOOK_SECRET=ghsec_dev pnpm build
```

The webhook secrets are only required for a _production_ build (`next build` fails closed if they're missing — see `apps/web/relayos.config.ts`). Plain `pnpm dev`/`relay dev` doesn't need them; it falls back to fixed dev-only secrets automatically.

**5. Run the app:**

```sh
DATABASE_URL=postgres://localhost:5432/relayos_dev pnpm exec relay dev --dir apps/web
```

This starts `apps/web`'s dev server and tails new executions live to the terminal.

**6. Confirm it's working**, from another terminal, using the dev-only `test` provider (no signature needed) or a real one:

```sh
curl -X POST http://localhost:3000/api/relay/test -H "Content-Type: application/json" -d '{"type":"ping"}'

# or simulate a real signed Stripe event:
STRIPE_WEBHOOK_SECRET=whsec_test_secret pnpm exec relay trigger stripe charge.succeeded --data '{"id":"ch_1","amount":1000,"currency":"usd"}'
```

⚠️ **Gotcha**: `relay trigger` requires `<PROVIDER>_WEBHOOK_SECRET` to be set (it signs the payload with it), while the app falls back to a fixed dev secret (`whsec_test_secret`/`ghsec_test_secret`, see `apps/web/relayos.config.ts`) when its variable is unset. Signatures only match when both sides use the same value — simplest in dev: leave the app's env unset and pass the matching fallback to trigger, e.g. `STRIPE_WEBHOOK_SECRET=whsec_test_secret pnpm exec relay trigger stripe ...`.

Then inspect what happened:

```sh
DATABASE_URL=postgres://localhost:5432/relayos_dev pnpm exec relay inspect <eventId>
```

## Testing

```sh
pnpm test
```

`relayos`'s tests are pure unit tests (in-memory store, no I/O). `@relayos/postgres`'s tests are integration tests against a real database and need a container runtime (Docker, Colima, Podman) — they spin up a disposable Postgres via [testcontainers](https://node.testcontainers.org), run migrations against it, and tear it down after. No manual database setup required.

If your environment can't run containers (e.g. a CI runner without Docker-in-Docker), set `TEST_DATABASE_URL` to point at a real Postgres instead — testcontainers is skipped entirely when it's set:

```sh
TEST_DATABASE_URL=postgres://localhost:5432/relayos_test pnpm test
```

## Status

RelayOS is pre-1.0 and under active development. The core runtime (events, executions, steps, logs, retries, restart, replay, dedup, concurrency-safe execution locking) is built and verified end-to-end against real signed webhook payloads and a real Postgres database — but it hasn't shipped a dashboard/observability UI yet (everything is currently inspectable via the API or `psql`), and retry/lock coordination is in-process only, so it doesn't yet coordinate across multiple server instances.
