import { describe, expect, it, vi } from "vitest";

import { findEventById, insertEvent } from "./events.repo.js";

describe("events.repo", () => {
  it("inserts a new event row", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "evt_1", provider: "github" }],
    });

    await expect(
      insertEvent(
        { query } as never,
        "relayos",
        {
          provider: "github",
          eventName: "push",
          externalEventId: "ext_1",
          payload: { ok: true },
          rawPayload: { raw: true },
          headers: { "x-test": "1" },
        },
      ),
    ).resolves.toEqual({
      event: { id: "evt_1", provider: "github" },
      inserted: true,
    });
  });

  it("resolves duplicate events by loading the existing row", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "evt_existing", provider: "github" }] });

    await expect(
      insertEvent(
        { query } as never,
        "relayos",
        {
          provider: "github",
          eventName: "push",
          externalEventId: "ext_1",
          payload: {},
          rawPayload: {},
          headers: {},
        },
      ),
    ).resolves.toEqual({
      event: { id: "evt_existing", provider: "github" },
      inserted: false,
    });
  });

  it("throws when duplicate resolution fails or insert has no id without external id", async () => {
    await expect(
      insertEvent(
        {
          query: vi
            .fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] }),
        } as never,
        "relayos",
        {
          provider: "github",
          eventName: "push",
          externalEventId: "ext_1",
          payload: {},
          rawPayload: {},
          headers: {},
        },
      ),
    ).rejects.toThrow("Failed to resolve duplicate event");

    await expect(
      insertEvent(
        {
          query: vi.fn().mockResolvedValue({ rows: [] }),
        } as never,
        "relayos",
        {
          provider: "github",
          eventName: "push",
          externalEventId: null,
          payload: {},
          rawPayload: {},
          headers: {},
        },
      ),
    ).rejects.toThrow("Failed to insert event");
  });

  it("finds events by id", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "evt_1" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(findEventById({ query } as never, "relayos", "evt_1")).resolves.toEqual({
      id: "evt_1",
    });
    await expect(findEventById({ query } as never, "relayos", "missing")).resolves.toBeNull();
  });
});
