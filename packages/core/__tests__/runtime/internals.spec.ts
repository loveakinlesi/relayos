import { describe, expect, it } from "vitest";

import { getRelayOSInternals, relayosInternals } from "../../src/runtime/internals.js";

describe("getRelayOSInternals", () => {
  it("returns the internal runtime contract for a valid runtime", () => {
    const internals = { schema: "relayos" };
    const runtime = {
      [relayosInternals]: internals,
    };

    expect(getRelayOSInternals(runtime)).toBe(internals);
  });

  it("throws for arbitrary objects", () => {
    expect(() => getRelayOSInternals({})).toThrow(
      "Invalid RelayOS runtime instance. Expected an object created by createRelayOS().",
    );
  });
});
