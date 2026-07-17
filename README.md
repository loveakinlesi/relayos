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
- **Postgres, SQLite, or MySQL, auto-detected** — pass a raw `pg.Pool`, `better-sqlite3.Database`, or `mysql2.Pool` straight into `relayos({ database })` and RelayOS detects the dialect and applies its own prefixed tables (`relayos_executions`, etc.), so they never collide with your application's own.
- **First-class local dev tooling** — `relay migrate` applies the schema with one command; `relay dev` runs your app and tails live execution activity to the terminal.

## Quickstart

```sh
pnpm add relayos better-sqlite3
```

`relayos` ships the engine and framework adapters (`relayos/next-js`, `relayos/express`, `relayos/hono`, `relayos/nestjs`) out of the box — `better-sqlite3` is the fastest way to get a real database running locally, with no separate server.

```ts
// relay.ts — wiring only
import { relayos } from 'relayos';
import Database from 'better-sqlite3';
import { registerHandlers } from './relay.handlers';

export const relay = relayos({ database: new Database('relay.db') });
export type AppRelay = typeof relay; // carries the typed event catalog forward
registerHandlers(relay);
```

```ts
// relay.handlers.ts — handler logic lives here, not in relay.ts
import type { AppRelay } from './relay';

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
// try it — no HTTP, no plugin required
import { relay } from './relay';

const execution = await relay.ingest({
  id: crypto.randomUUID(),
  type: 'order.placed',
  data: { orderId: 'ord_1', amount: 4200 },
  receivedAt: new Date().toISOString(),
});

console.log(execution.status); // "completed" — charge-payment never re-runs on retry
```

From here: add provider plugins once you're ready to receive real, signature-verified webhooks; swap `database` for a `pg.Pool` or `mysql2.Pool` once you're ready for a multi-instance production deployment; import a framework adapter like `relayos/next-js`, `relayos/express`, `relayos/hono`, or `relayos/nestjs` to mount HTTP routes. See `apps/docs` (`pnpm --filter docs dev`, served on `:3001`) for the full installation guide, basic usage, and API reference.

## Packages

This is a Turborepo monorepo:

| Package                                  | Purpose                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`relayos`](./packages/relayos)          | The SDK: `relayos`, the user-facing types, and framework adapters (`relayos/next-js`, `relayos/express`, `relayos/hono`, `relayos/nestjs`). The only required install.                                                                                                                                                                                                                           |
| [`@relayos/core`](./packages/core)       | The engine: durable executions, steps, retries, replay, and the contracts (`ExecutionStore`, `RelayPlugin`) everything else builds on. Also owns database support — pass a raw Postgres/SQLite/MySQL client into `relayos({ database })` and the dialect is auto-detected (built on [Kysely](https://kysely.dev), with hand-written versioned migrations). Pulled in automatically by `relayos`. |
| [`@relayos/plugin`](./packages/plugin)   | Plugin authoring kit: `definePlugin` + webhook signature helpers for building your own providers. Optional.                                                                                                                                                                                                                                                                                      |
| [`@relayos/stripe`](./packages/stripe)   | Stripe plugin: signature verification + a fully-typed catalog of every Stripe event (peer-depends on `stripe`). Optional.                                                                                                                                                                                                                                                                        |
| [`@relayos/github`](./packages/github)   | GitHub plugin: signature verification + a fully-typed catalog of every GitHub webhook event. Optional.                                                                                                                                                                                                                                                                                           |
| [`@relayos/clerk`](./packages/clerk)     | Clerk plugin: Svix signature verification + typed event names for common Clerk webhook events. Optional.                                                                                                                                                                                                                                                                                         |
| [`@relayos/shopify`](./packages/shopify) | Shopify plugin: HMAC signature verification + typed event names for common Shopify webhook topics. Optional.                                                                                                                                                                                                                                                                                     |
| [`@relayos/resend`](./packages/resend)   | Resend plugin: Svix signature verification + typed event names for Resend email events. Optional.                                                                                                                                                                                                                                                                                                |
| [`@relayos/cli`](./packages/cli)         | `relay init`, `relay migrate`, `relay dev`, `relay trigger`, `relay inspect`, `relay replay`, `relay events list`.                                                                                                                                                                                                                                                                               |
| [`apps/docs`](./apps/docs)               | The documentation site (Fumadocs). `pnpm --filter docs dev` serves it on port 3001.                                                                                                                                                                                                                                                                                                              |

## Local Development

Setting up this monorepo (not just consuming the published packages) to hack on the runtime itself:

**1. Prerequisites**

- Node >=22, pnpm >=9
- `@relayos/core`'s database contract tests want a container runtime (Docker, Colima, or Podman) for the Postgres/MySQL legs — see [Testing](#testing) below if you don't have one.

**2. Clone the repo:**

```sh
git clone <repo-url> && cd relayos
pnpm install
```

**3. Build everything:**

```sh
pnpm build
```

`relay` won't be on your `$PATH` the first time — `pnpm install` links it into the workspace root's `node_modules/.bin`, so `pnpm exec relay ...` (or `pnpm exec` from any workspace package) always resolves it.

**4. Run the tests:**

```sh
pnpm test
```

There's no bundled sample app in this repo — `e2e/` is the workspace-linked, end-to-end check: it spawns a real HTTP server from a generated `relay.ts`, exercised via the built `relay` CLI binary and direct `fetch` calls, so it verifies actual local changes to every package before they'd reach a published release. See [Testing](#testing) for how it and the rest of the suite fit together.

## Testing

```sh
pnpm test
```

Most tests are pure unit tests (no I/O). `@relayos/core`'s `store.contract.test.ts` is a parametrized integration suite that runs the same `ExecutionStore` assertions against Postgres, SQLite, and MySQL — SQLite runs in-process (`:memory:`), while Postgres and MySQL spin up disposable containers via [testcontainers](https://node.testcontainers.org), run migrations against them, and tear down after. No manual database setup required.

If your environment can't run containers (e.g. a CI runner without Docker-in-Docker, or this sandbox), set `TEST_DATABASE_URL` / `TEST_MYSQL_URL` to point at real instances instead — testcontainers is skipped entirely when they're set:

```sh
TEST_DATABASE_URL=postgres://localhost:5432/relayos_test TEST_MYSQL_URL=mysql://localhost:3306/relayos_test pnpm test
```

`e2e/` runs a small number of integration tests against a real spawned app process: the CLI wizard's actual generated `relay.ts`, loaded by a minimal HTTP server, driven both by the built `relay` CLI binary and by direct `fetch` calls. No install step and no published packages required - the fixture is created inside `e2e/` itself so it resolves the real workspace-linked builds.

## Status

RelayOS is pre-1.0 and under active development. The core runtime (events, executions, steps, logs, retries, restart, replay, dedup, concurrency-safe execution locking) is built and verified end-to-end against real signed webhook payloads and a real Postgres database — but it hasn't shipped a dashboard/observability UI yet (everything is currently inspectable via the API or `psql`), and retry/lock coordination is in-process only, so it doesn't yet coordinate across multiple server instances.
