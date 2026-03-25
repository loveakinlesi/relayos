# relayos/nestjs

NestJS integration layer for wiring path-based webhook routes into the RelayOS runtime.

## Goal

Enable this flow in a Nest backend:

- POST webhook to `/webhooks/:provider`
- `RelayOSService.handle(...)` forwards the request into RelayOS
- RelayOS persists the event and creates or continues execution work

## Install

Workspace package:

```sh
pnpm --filter relayos/nestjs add relayos/core
```

## Module Registration

```ts
import { Module } from "@nestjs/common";
import { RelayOSModule } from "relayos/nestjs";
import { stripe } from "relayos/stripe";

@Module({
  imports: [
    RelayOSModule.forRoot({
      database: {
        connectionString: process.env.DATABASE_URL!,
        schema: "relayos",
      },
      retry: {
        maxAttempts: 5,
        backoffBaseMs: 1_000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: { maxConcurrent: 20 },
      retryPollIntervalMs: 5_000,
      plugins: [stripe()],
    }),
  ],
})
export class AppModule {}
```

`forRootAsync(...)` is also supported for config-driven registration.

## Controller Usage

```ts
import { Controller, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { RelayOSService } from "relayos/nestjs";

@Controller("webhooks")
export class WebhookController {
  constructor(private readonly relay: RelayOSService) {}

  @Post(":provider")
  async ingest(
    @Param("provider") provider: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
  ) {
    return this.relay.handle(provider, req, res);
  }
}
```

## Service API

`RelayOSService` exposes:

- `handle(provider, req, res)`
- `replay(eventId)`
- `resume(executionId)`
- `stop(executionId)`
- `progress(executionId)`

## Response Mapping

- `202`: webhook accepted and forwarded to runtime
- `400`: missing provider route param or missing raw body
- `401`: verification failed (`VerificationError`)
- `404`: no registered plugin for provider (`PluginNotFoundError`)
- `500`: unexpected processing failure

## Important: raw body preservation

Signature verification requires raw request bytes. Configure Nest/Express raw-body capture so `req.rawBody` is available; otherwise verification can fail after JSON parsing mutates the payload.
