import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/context/step.js",  () => ({
  runStep: vi.fn(),
}));

vi.mock("../../src/context/logger.js",  () => ({
  logExecution: vi.fn(),
}));

import { logExecution } from "../../src/context/logger.js";
import { runStep } from "../../src/context/step.js";
import { createContext } from "../../src/context/create-context.js";

describe("createContext", () => {
  it("builds a context that delegates step and log operations", async () => {
    vi.mocked(runStep).mockResolvedValue("done");
    vi.mocked(logExecution).mockResolvedValue(undefined);

    const pool = {} as never;
    const emitSignal = vi.fn();
    const context = createContext(
      pool,
      "relayos",
      { id: "exe_1", attempt: 2 } as never,
      { provider: "github", eventName: "push" } as never,
      emitSignal,
    );

    await expect(context.step("charge-card", async () => "done")).resolves.toBe("done");
    await context.log("info", "processed", { ok: true });

    expect(context.executionId).toBe("exe_1");
    expect(context.attempt).toBe(2);
    expect(context.event.provider).toBe("github");
    expect(runStep).toHaveBeenCalledWith(
      pool,
      "relayos",
      "exe_1",
      "charge-card",
      expect.any(Function),
      emitSignal,
    );
    expect(logExecution).toHaveBeenCalledWith(
      pool,
      "relayos",
      "exe_1",
      "info",
      "processed",
      { ok: true },
    );
  });
});
