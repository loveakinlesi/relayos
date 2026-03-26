import { describe, expect, it, vi } from "vitest";

import { resolveHandler } from "../../src/plugins/resolve-handler.js";
import type { RelayPlugin } from "../../src/types/plugin.js";

function makePlugin(resolveHandlerImpl: RelayPlugin["resolveHandler"], onEvent?: RelayPlugin["onEvent"]): RelayPlugin {
  return {
    provider: "github",
    async verify() {},
    async normalize() {
      return {
        provider: "github",
        eventName: "push",
        externalEventId: "evt_1",
        payload: {},
        rawPayload: {},
        headers: {},
      };
    },
    resolveHandler: resolveHandlerImpl,
    onEvent,
  };
}

describe("resolveHandler", () => {
  it("returns semantic handler when available", async () => {
    const semantic = vi.fn();
    const fallback = vi.fn();

    expect(resolveHandler(makePlugin(() => semantic, fallback), "push")).toBe(semantic);
  });

  it("falls back to onEvent when no semantic handler exists", async () => {
    const fallback = vi.fn();

    expect(resolveHandler(makePlugin(() => null, fallback), "push")).toBe(fallback);
  });

  it("returns null when neither semantic nor generic handlers exist", async () => {
    expect(resolveHandler(makePlugin(() => null), "push")).toBeNull();
  });
});
