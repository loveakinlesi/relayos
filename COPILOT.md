# RelayOS — Copilot Context

RelayOS is a **durable webhook execution runtime** for Node.js. It turns inbound webhooks into persistent, replayable workflows backed by Postgres — handling signature verification, step checkpoints, retry scheduling, and replay/resume operations.

---

## Monorepo Structure

```
packages/
  core/        → relayos/core       — low-level runtime engine (private)
  relayos/     → relayos            — thin public SDK wrapper (private)
  nestjs/      → relayos/nestjs     — NestJS HTTP adapter (private)
```

**Package manager:** pnpm with workspace protocol (`workspace:*`)  
**Build orchestration:** Turborepo (`pnpm build`, `pnpm test`, `pnpm typecheck`)  
**Build tooling:** tsup (ESM + CJS + DTS per package)  
**Test runner:** Vitest  
**Language:** TypeScript 6, Node.js ≥ 20

---

## Package Responsibilities

### `relayos/core` (`packages/core`)

The runtime engine. Never import this directly in application code — use the `relayos` wrapper.

Key subpath exports:
- `.` — `createRelayOS()`, `RelayOS`, `RelayPlugin`, `ExecutionContext`, types
- `./errors` — `VerificationError` (code: `VERIFICATION_FAILED`), `PluginNotFoundError` (code: `PLUGIN_NOT_FOUND`)
- `./persistence` — schema migration runner
- `./persistence/client` — `createPool()`
- `./persistence/migrate` — `runMigrations()`
- `./persistence/executions.repo` — `findExecutionById`, `findExecutionsByStatus`, `updateExecutionStatus`
- `./persistence/steps.repo` — `findStepsByExecution`
- `./replay/replay` — `replayEvent()`
- `./replay/resume` — `resumeFailedExecution()`
- `./runtime/internals` — `getRelayOSInternals()` (internal pool/schema access)

Internal layout:
```
src/runtime/      → engine, queue, execute, retry-poller, internals
src/context/      → execution context, ctx.step(), logger
src/plugins/      → plugin registry, handler resolution
src/persistence/  → Postgres client, repos (events, executions, steps, retries, logs)
src/retry/        → retry policy, backoff, scheduler
src/replay/       → replay and resume
src/types/        → RelayPlugin, RelayConfig, ExecutionContext, event types
src/errors/       → VerificationError, PluginNotFoundError
```

### `relayos` (`packages/relayos`)

Thin wrapper. Exports `relayos(options)` factory and curated type re-exports from core. Use this as the public entrypoint for most application code.

### `relayos/nestjs` (`packages/nestjs`)

NestJS HTTP adapter. Three usage surfaces:
- `RelayOSModule.forRoot(options)` / `RelayOSModule.forRootAsync(options)` — DI module
- `RelayOSService` — injectable service with `handle()`, `replay()`, `resume()`, `stop()`, `progress()`
- `handleNestWebhook(runtime, provider, request)` — standalone adapter function (no DI)

---

## Core Execution Model

Every webhook follows this flow, without exception:

```
Inbound HTTP POST
  → Framework adapter (nestjs)
    → processEvent({ provider, rawBody, headers })
      → Plugin: verify signature + normalize payload
        → Event stored (immutable)
          → Execution created
            → ctx.step("name", async () => { ... }) checkpoints
              → Retry scheduling (persistent, Postgres-backed)
```

Key invariants:
- **Events are immutable** — stored payload snapshots are never mutated
- **Executions represent attempts** — multiple executions per event are valid (replay creates new ones)
- **Steps are the only durable side-effect boundary** — all side-effects must live inside `ctx.step()`
- **Completed steps never re-run** — idempotent by design
- **Retries are persistent** — in-memory-only retry logic is forbidden
- **Steps are sequential in v1** — no parallel steps, no DAG

---

## Development Commands

```sh
# Workspace-wide (run from repo root)
pnpm build          # build all packages in dependency order
pnpm test           # run all tests
pnpm typecheck      # type-check all packages
pnpm lint           # ESLint across workspace
pnpm clean          # remove all dist/ outputs

# Filter to a single package
pnpm --filter relayos/core build
pnpm --filter relayos/core test
pnpm --filter @relayos/nestjs test
pnpm --filter relayos typecheck
```

Turbo caches task outputs. Pass `--force` to bypass cache when needed.

---

## Writing a Plugin

Plugins are the provider boundary. They live in `relayos/core`'s plugin registry.

```ts
import { type RelayPlugin } from "relayos/core";
import { VerificationError } from "relayos/core/errors";

const myPlugin: RelayPlugin = {
  provider: "my-provider",

  async verify(rawBody, headers) {
    const sig = headers["x-my-signature"];
    if (!isValid(rawBody, sig)) {
      throw new VerificationError("Invalid signature");
    }
  },

  async normalize(rawBody, headers) {
    const payload = JSON.parse(rawBody.toString());
    return { event: payload.type, data: payload };
  },

  handlers: {
    "payment.succeeded": async (ctx, event) => {
      await ctx.step("send-receipt", async () => {
        await sendEmail(event.data.email);
      });
    },
  },
};
```

---

## NestJS Integration

```ts
// app.module.ts
RelayOSModule.forRoot({
  connectionString: process.env.DATABASE_URL,
  schema: "relayos",
  plugins: [myPlugin],
})

// webhooks.controller.ts
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly relayos: RelayOSService) {}

  @Post(":provider")
  async receive(@Param("provider") provider: string, @Req() req: Request) {
    return this.relayos.handle(provider, req, res);
  }
}
```

Raw body must be available on `req.rawBody`. Configure Nest to preserve it:

```ts
NestFactory.create(AppModule, { rawBody: true });
```

---

## Package Naming Conventions

| Package | npm name |
|---|---|
| `packages/core` | `relayos/core` |
| `packages/relayos` | `relayos` |
| `packages/nestjs` | `relayos/nestjs` |
| Future scoped adapters | `@relayos/<name>` |

Workspace references use `"relayos/core": "workspace:*"` in `package.json`.

---

## Error Handling Conventions

Runtime errors carry a `code` string property. Use duck-typed detection rather than `instanceof` when the import path is a subpath of a workspace package:

```ts
const err = error as { code?: string };

if (err.code === "VERIFICATION_FAILED") { ... }
if (err.code === "PLUGIN_NOT_FOUND") { ... }
```

HTTP status mapping (for framework adapters):

| Error code | HTTP status |
|---|---|
| `VERIFICATION_FAILED` | 401 |
| `PLUGIN_NOT_FOUND` | 404 |
| Unknown | 500 |
| Accepted | 202 |

---

## Key Files

| File | Purpose |
|---|---|
| `rules.md` | Engineering rules — read before structural changes |
| `architecture.md` | System layers and package boundaries |
| `DATABASE_MODEL.md` | Postgres schema and table contracts |
| `ENGINE_FLOW.md` | Runtime execution flow walkthrough |
| `PLUGIN_SYSTEM.md` | Plugin interface and handler lifecycle |
| `runtime-concepts.md` | Step, context, retry, replay concepts |
| `packages/core/README.md` | Core package usage and quick start |
| `packages/nestjs/README.md` | NestJS adapter usage and controller example |

---

## What To Avoid

- Do not add business logic to framework adapters — they translate HTTP, nothing more
- Do not execute side-effects outside `ctx.step()` in handlers
- Do not use in-memory-only retry mechanisms
- Do not mutate stored event payloads
- Do not implement parallel steps or DAG-style workflows (v1 constraint)
- Do not add speculative abstractions or unasked-for configurability
- Do not add error handling for scenarios that cannot happen given internal guarantees
