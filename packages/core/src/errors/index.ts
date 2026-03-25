export class VerificationError extends Error {
  readonly code = "VERIFICATION_FAILED" as const;

  constructor(
    message: string,
    public readonly provider: string,
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

export class StepError extends Error {
  readonly code = "STEP_FAILED" as const;

  constructor(
    message: string,
    public readonly stepName: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StepError";
  }
}

export class ExecutionError extends Error {
  readonly code = "EXECUTION_FAILED" as const;

  constructor(
    message: string,
    public readonly executionId: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}

export class PluginNotFoundError extends Error {
  readonly code = "PLUGIN_NOT_FOUND" as const;

  constructor(public readonly provider: string) {
    super(`No plugin registered for provider: "${provider}"`);
    this.name = "PluginNotFoundError";
  }
}
