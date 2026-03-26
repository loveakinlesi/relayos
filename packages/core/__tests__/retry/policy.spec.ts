import { describe, it, expect } from "vitest";
import { isRetryEligible } from "../../src/retry/policy.js";
import type { DbExecution } from "../../src/types/execution.js";
import { ExecutionStatus } from "../../src/types/event.js";
import type { RetryPolicy } from "../../src/types/config.js";

const policy: RetryPolicy = {
  maxAttempts: 3,
  backoffBaseMs: 1000,
  backoffMultiplier: 2,
  backoffMaxMs: 60_000,
};

function makeExecution(attempt: number): DbExecution {
  return {
    id: "exec-1",
    event_id: "event-1",
    status: ExecutionStatus.Failed,
    attempt,
    started_at: null,
    finished_at: null,
    error_message: null,
    created_at: new Date(),
  };
}

describe("isRetryEligible", () => {
  it("allows retry when attempt is below limit", () => {
    expect(isRetryEligible(makeExecution(0), policy)).toBe(true);
    expect(isRetryEligible(makeExecution(1), policy)).toBe(true);
  });

  it("disallows retry when attempt reaches limit", () => {
    // maxAttempts=3 means attempts 0,1,2 are allowed; 2+1=3 >= 3 → not eligible
    expect(isRetryEligible(makeExecution(2), policy)).toBe(false);
  });

  it("disallows retry beyond the limit", () => {
    expect(isRetryEligible(makeExecution(5), policy)).toBe(false);
  });

  it("allows first retry with maxAttempts=1 only on attempt 0... wait no", () => {
    // maxAttempts=1: only attempt 0 is allowed; 0+1=1 >= 1 → not eligible for retry
    const singleAttemptPolicy: RetryPolicy = { ...policy, maxAttempts: 1 };
    expect(isRetryEligible(makeExecution(0), singleAttemptPolicy)).toBe(false);
  });
});
