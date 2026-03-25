import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../persistence/events.repo.js", () => ({
  insertEvent: vi.fn(),
}));

vi.mock("../persistence/executions.repo.js", () => ({
  createExecution: vi.fn(),
}));

import { insertEvent } from "../persistence/events.repo.js";
import { createExecution } from "../persistence/executions.repo.js";
import { createEngine } from "./engine.js";
import { ConcurrencyQueue } from "./queue.js";
import { PluginRegistry } from "../plugins/registry.js";
import { PluginNotFoundError } from "../errors/index.js";

describe("createEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ingests a normalized event and returns the event id", async () => {
    vi.mocked(insertEvent).mockResolvedValue({
      event: { id: "evt_1" } as never,
      inserted: true,
    });
    vi.mocked(createExecution).mockResolvedValue({ id: "exe_1" } as never);

    const queue = new ConcurrencyQueue(1);
    const runExecution = vi.fn().mockResolvedValue(undefined);
    const engine = createEngine(
      {} as never,
      { database: { schema: "relayos" } } as never,
      new PluginRegistry(),
      queue,
      runExecution,
    );

    const result = await engine.processEvent({
      provider: "github",
      eventName: "push",
      externalEventId: "evt_ext_1",
      payload: {},
      rawPayload: {},
      headers: {},
    });

    expect(result).toBe("evt_1");
    expect(createExecution).toHaveBeenCalledWith(expect.anything(), "relayos", "evt_1");
  });

  it("short-circuits duplicate events without creating another execution", async () => {
    vi.mocked(insertEvent).mockResolvedValue({
      event: { id: "evt_existing" } as never,
      inserted: false,
    });

    const queue = new ConcurrencyQueue(1);
    const engine = createEngine(
      {} as never,
      { database: { schema: "relayos" } } as never,
      new PluginRegistry(),
      queue,
      vi.fn(),
    );

    const result = await engine.processEvent({
      provider: "github",
      eventName: "push",
      externalEventId: "evt_ext_1",
      payload: {},
      rawPayload: {},
      headers: {},
    });

    expect(result).toBe("evt_existing");
    expect(createExecution).not.toHaveBeenCalled();
  });

  it("throws when the provider plugin cannot be resolved", async () => {
    const engine = createEngine(
      {} as never,
      { database: { schema: "relayos" } } as never,
      new PluginRegistry(),
      new ConcurrencyQueue(1),
      vi.fn(),
    );

    await expect(
      engine.processEvent({
        provider: "missing",
        rawBody: Buffer.from("{}"),
        headers: {},
      }),
    ).rejects.toBeInstanceOf(PluginNotFoundError);
  });

  it("verifies and normalizes incoming webhooks before ingestion", async () => {
    vi.mocked(insertEvent).mockResolvedValue({
      event: { id: "evt_raw" } as never,
      inserted: true,
    });
    vi.mocked(createExecution).mockResolvedValue({ id: "exe_raw" } as never);

    const verify = vi.fn().mockResolvedValue(undefined);
    const normalize = vi.fn().mockResolvedValue({
      provider: "github",
      eventName: "push",
      externalEventId: "evt_external",
      payload: { action: "push" },
      rawPayload: { raw: true },
    });
    const registry = new PluginRegistry();
    registry.register({
      provider: "github",
      verify,
      normalize,
      resolveHandler: () => null,
    });

    const engine = createEngine(
      {} as never,
      { database: { schema: "relayos" } } as never,
      registry,
      new ConcurrencyQueue(1),
      vi.fn().mockResolvedValue(undefined),
    );

    const rawBody = Buffer.from('{"ok":true}');
    const headers = { "x-github-event": "push" };

    await expect(
      engine.processEvent({
        provider: "github",
        rawBody,
        headers,
      }),
    ).resolves.toBe("evt_raw");

    expect(verify).toHaveBeenCalledWith(rawBody, headers);
    expect(normalize).toHaveBeenCalledWith(rawBody, headers);
    expect(insertEvent).toHaveBeenCalledWith(expect.anything(), "relayos", {
      provider: "github",
      eventName: "push",
      externalEventId: "evt_external",
      payload: { action: "push" },
      rawPayload: { raw: true },
      headers,
    });
  });
});
