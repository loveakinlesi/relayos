import { describe, it, expect } from "vitest";
import { computeNextAttemptAt } from "../../src/retry/backoff.js";
import type { RetryPolicy } from "../../src/types/config.js";

const policy: RetryPolicy = {
  maxAttempts: 3,
  backoffBaseMs: 1000,
  backoffMultiplier: 2,
  backoffMaxMs: 60_000,
};

describe("computeNextAttemptAt", () => {
  it("returns base delay for attempt 0", () => {
    const before = Date.now();
    const result = computeNextAttemptAt(0, policy);
    const after = Date.now();

    expect(result.getTime()).toBeGreaterThanOrEqual(before + 1000);
    expect(result.getTime()).toBeLessThanOrEqual(after + 1000);
  });

  it("doubles the delay on each attempt (exponential backoff)", () => {
    const t0 = computeNextAttemptAt(0, policy).getTime() - Date.now();
    const t1 = computeNextAttemptAt(1, policy).getTime() - Date.now();
    const t2 = computeNextAttemptAt(2, policy).getTime() - Date.now();

    expect(Math.round(t1 / t0)).toBe(2);
    expect(Math.round(t2 / t0)).toBe(4);
  });

  it("caps delay at backoffMaxMs", () => {
    const capped = computeNextAttemptAt(100, policy);
    const maxFuture = Date.now() + policy.backoffMaxMs;

    expect(capped.getTime()).toBeLessThanOrEqual(maxFuture + 5);
  });

  it("applies a custom multiplier", () => {
    const custom: RetryPolicy = { ...policy, backoffBaseMs: 500, backoffMultiplier: 3 };
    const t0 = computeNextAttemptAt(0, custom).getTime() - Date.now();
    const t1 = computeNextAttemptAt(1, custom).getTime() - Date.now();

    expect(Math.round(t1 / t0)).toBe(3);
  });
});
