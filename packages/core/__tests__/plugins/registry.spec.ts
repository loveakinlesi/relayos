import { describe, expect, it } from "vitest";
import { PluginRegistry } from "../../src/plugins/registry.js";
import type { RelayPlugin } from "../../src/types/plugin.js";

function makePlugin(provider: string): RelayPlugin {
  return {
    provider,
    async verify() {
      return;
    },
    async normalize() {
      return {
        provider,
        eventName: "event.test",
        externalEventId: null,
        payload: {},
        rawPayload: {},
        headers: {},
      };
    },
    resolveHandler() {
      return null;
    },
  };
}

describe("PluginRegistry", () => {
  it("registers and resolves plugins", () => {
    const registry = new PluginRegistry();
    const stripe = makePlugin("stripe");

    registry.register(stripe);

    expect(registry.has("stripe")).toBe(true);
    expect(registry.get("stripe")).toBe(stripe);
    expect(registry.providers()).toEqual(["stripe"]);
  });

  it("throws on duplicate provider registration", () => {
    const registry = new PluginRegistry();

    registry.register(makePlugin("stripe"));

    expect(() => registry.register(makePlugin("stripe"))).toThrow(
      'A plugin for provider "stripe" is already registered.',
    );
  });

  it("returns undefined for unknown providers", () => {
    const registry = new PluginRegistry();

    expect(registry.get("github")).toBeUndefined();
  });
});
