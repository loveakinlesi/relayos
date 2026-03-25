import { describe, expect, it } from "vitest";

import {
  ExecutionError,
  PluginNotFoundError,
  StepError,
  VerificationError,
} from "./index.js";

describe("core errors", () => {
  it("creates verification errors with provider metadata", () => {
    const error = new VerificationError("invalid signature", "stripe");

    expect(error.name).toBe("VerificationError");
    expect(error.code).toBe("VERIFICATION_FAILED");
    expect(error.provider).toBe("stripe");
  });

  it("creates step and execution errors with causes", () => {
    const cause = new Error("root");
    const stepError = new StepError("step failed", "persist-order", cause);
    const executionError = new ExecutionError("execution failed", "exe_1", cause);

    expect(stepError.name).toBe("StepError");
    expect(stepError.code).toBe("STEP_FAILED");
    expect(stepError.stepName).toBe("persist-order");
    expect(stepError.cause).toBe(cause);

    expect(executionError.name).toBe("ExecutionError");
    expect(executionError.code).toBe("EXECUTION_FAILED");
    expect(executionError.executionId).toBe("exe_1");
    expect(executionError.cause).toBe(cause);
  });

  it("creates plugin resolution errors with a stable message", () => {
    const error = new PluginNotFoundError("github");

    expect(error.name).toBe("PluginNotFoundError");
    expect(error.code).toBe("PLUGIN_NOT_FOUND");
    expect(error.provider).toBe("github");
    expect(error.message).toBe('No plugin registered for provider: "github"');
  });
});
