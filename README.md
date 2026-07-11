# RelayOS

**RelayOS is a durable webhook execution platform that helps developers build reliable, replayable, and observable event-driven backends.**

Receiving a webhook is easy. Reliably processing everything that has to happen *after* it — retrying the parts that failed, not re-running the parts that didn't, replaying a historical event to debug it, seeing exactly what happened and why — is the hard part. RelayOS is the runtime for that.

|  | Category |
|---|---|
| Better Auth | Authentication framework |
| Drizzle | ORM |
| Hono | Web framework |
| **RelayOS** | **Webhook execution platform** |

## Why

Webhook handlers are usually a pile of `if` statements with no memory of what already happened. A provider retries, and you double-charge a customer. A step three-quarters through a handler fails, and you re-run everything from scratch — or worse, nothing at all, silently. Debugging means grepping logs, because there's no record of what actually executed.

RelayOS gives you:

- **Durable steps** — `ctx.step.run(name, fn)` checkpoints each unit of work. A retry resumes past whatever already succeeded; it never re-runs a completed step's side effects.
- **Automatic retries** — a failed execution schedules its own retry with exponential backoff, up to a configurable cap, with no polling or queue infrastructure to run.
- **Replay & restart** — `retryExecution` resumes in place, `restartExecution` forces every step to re-run (for when the step logic itself was wrong, not just flaky), and `replayExecution` reprocesses a historical event as a brand-new execution without touching the original.
- **A real audit trail** — every step attempt is a new row, never overwritten, so a step that failed twice before succeeding shows all three attempts. Every execution's log stream interleaves the runtime's own lifecycle events (`retrying (attempt 2, scheduled)`) with your handler's own logging, tagged so you can tell them apart.
- **Provider adapters with real signature verification** — Stripe and GitHub today, each doing actual HMAC verification against the raw request body, not a stub.
- **A dedicated Postgres schema** — RelayOS's tables live under their own `relayos` schema, not `public`, so they never collide with your application's own tables.
- **First-class local dev tooling** — `relay migrate` applies the schema with one command; `relay dev` runs your app and tails live execution activity to the terminal.

## Quickstart

```sh
pnpm add relayos @relayos/postgres
```

```ts
// relayos.config.ts
import { createRelay } from 'relayos';
import { stripe } from 'relayos/plugins/stripe';
import { createDb, createPostgresExecutionStore } from '@relayos/postgres';

const db = createDb(process.env.DATABASE_URL!);

export const relay = createRelay({
  database: createPostgresExecutionStore(db),
  plugins: [stripe({ webhookSecret: process.env.STRIPE_WEBHOOK_SECRET! })],
});

relay.on('stripe.charge.succeeded', async (event, ctx) => {
  const charge = event.data['object'] as { id: string; amount: number };

  const payment = await ctx.step.run('record-payment', async () => {
    return { chargeId: charge.id, amount: charge.amount };
  });

  await ctx.step.run('send-receipt', async () => {
    await sendReceiptEmail(payment);
  });

  ctx.log.info('payment processed', payment);
});
```

```ts
// app/api/relay/[...all]/route.ts (Next.js)
import { toNextJsHandler } from 'relayos/next-js';
import { relay } from '@/relayos.config';

export const { POST } = toNextJsHandler(relay);
```

```sh
DATABASE_URL=postgres://localhost:5432/myapp pnpm exec relay migrate
DATABASE_URL=postgres://localhost:5432/myapp pnpm exec relay dev --dir apps/web
```

Point Stripe at `/api/relay/stripe`, GitHub at `/api/relay/github`. If `send-receipt` fails, the execution automatically retries — `record-payment` never runs twice.

## Packages

This is a Turborepo monorepo:

| Package | Purpose |
|---|---|
| [`relayos`](./packages/relayos) | The runtime: `createRelay`, provider plugins (`relayos/plugins/stripe`, `relayos/plugins/github`), framework handlers (`relayos/next-js`). Storage-agnostic — ships an in-memory store by default. |
| [`@relayos/postgres`](./packages/postgres) | The Postgres storage adapter: schema, migrations, and the `ExecutionStore` implementation. |
| [`@relayos/cli`](./packages/cli) | `relay init`, `relay migrate`, `relay dev`, `relay trigger`, `relay inspect`, `relay replay`. |
| [`apps/web`](./apps/web) | A Next.js app used as the local dev/test harness for the runtime, wired up in `apps/web/relayos.config.ts`. |

## Local Development

Setting up this monorepo (not just consuming the published packages) to hack on the runtime itself:

**1. Prerequisites**
- Node >=20, pnpm >=9
- A local Postgres (for running `apps/web`). Separately, running `@relayos/postgres`'s tests wants a container runtime (Docker, Colima, or Podman) — see [Testing](#testing) below if you don't have one.

**2. Clone and check out the active branch** — development happens on `refresh`, not `main`:
```sh
git clone <repo-url> && cd relayos
git checkout refresh
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
The webhook secrets are only required for a *production* build (`next build` fails closed if they're missing — see `apps/web/relayos.config.ts`). Plain `pnpm dev`/`relay dev` doesn't need them; it falls back to fixed dev-only secrets automatically.

**5. Run the app:**
```sh
DATABASE_URL=postgres://localhost:5432/relayos_dev pnpm exec relay dev --dir apps/web
```
This starts `apps/web`'s dev server and tails new executions live to the terminal.

**6. Confirm it's working**, from another terminal, using the dev-only `test` provider (no signature needed) or a real one:
```sh
curl -X POST http://localhost:3000/api/relay/test -H "Content-Type: application/json" -d '{"type":"ping"}'

# or simulate a real signed Stripe event:
pnpm exec relay trigger stripe charge.succeeded --data '{"id":"ch_1","amount":1000,"currency":"usd"}'
```
⚠️ **Gotcha**: if you set `STRIPE_WEBHOOK_SECRET`/`GITHUB_WEBHOOK_SECRET` for one of `relay dev` or `relay trigger` but not the other, signatures won't match (each falls back to the *same* fixed dev secret only when the variable is unset on *both* sides). Simplest in dev: don't set them at all, for anything.

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

Development happens on the `refresh` branch.
