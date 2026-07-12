export type NormalizedEvent<TType extends string = string, TData = Record<string, unknown>> = {
  id: string;
  type: TType;
  data: TData;
  receivedAt: string;
};

export type StepStatus = 'completed' | 'failed';

export type ExecutionStep = {
  id: string;
  executionId: string;
  name: string;
  status: StepStatus;
  output?: unknown;
  error?: string;
  createdAt: string;
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** "system" entries are written by the runtime itself (ingest/retry/restart/replay
 *  lifecycle events); "handler" entries come from a handler's own ctx.log calls. */
export type LogSource = 'system' | 'handler';

export type ExecutionLog = {
  id: string;
  executionId: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  data?: unknown;
  createdAt: string;
};

export type RuntimeContext = {
  step: {
    run: <T>(name: string, fn: () => T | Promise<T>) => Promise<T>;
  };
  log: {
    debug: (message: string, data?: unknown) => void;
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
  };
};

export type EventHandler<TEvent extends NormalizedEvent<string, any> = NormalizedEvent> = (
  event: TEvent,
  ctx: RuntimeContext,
) => void | Promise<void>;

export type ExecutionStatus = 'pending' | 'completed' | 'failed';

export type Execution = {
  id: string;
  eventId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  status: ExecutionStatus;
  attempt: number;
  /** Set when this execution was created by replayExecution(), pointing at the source. */
  replayedFrom?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
};

export type ExecutionStore = {
  /**
   * Inserts an execution, returning false instead of throwing if one with
   * the same eventId already exists (an atomic insert-or-detect-conflict,
   * not a separate check-then-insert - the latter races under concurrent
   * calls for the same eventId).
   */
  create: (execution: Execution) => Promise<boolean>;
  update: (id: string, patch: Partial<Execution>) => Promise<void>;
  list: () => Promise<Execution[]>;
  get: (id: string) => Promise<Execution | undefined>;
  findByEventId: (eventId: string) => Promise<Execution | undefined>;
  /** The most recent attempt recorded for this step name, if any. */
  getStep: (executionId: string, name: string) => Promise<ExecutionStep | undefined>;
  /** Always appends a new row - step history is an audit trail, never overwritten. */
  saveStep: (step: ExecutionStep) => Promise<void>;
  listSteps: (executionId: string) => Promise<ExecutionStep[]>;
  saveLog: (log: ExecutionLog) => Promise<void>;
  listLogs: (executionId: string) => Promise<ExecutionLog[]>;
};

/**
 * A provider adapter. TEventMap is the plugin's typed event catalog: a map
 * from fully-namespaced event names (e.g. "stripe.charge.succeeded") to the
 * payload type that normalize() puts in NormalizedEvent.data for that event.
 * Untyped plugins leave it at the default and their events fall back to
 * Record<string, unknown>.
 */
export type RelayPlugin<TEventMap extends Record<string, unknown> = {}> = {
  /** Also the URL segment providers are mounted at, e.g. "stripe" -> /api/relay/stripe */
  id: string;
  verify: (req: Request) => Promise<boolean>;
  normalize: (rawBody: unknown, headers: Headers) => NormalizedEvent;
  /** Signs a raw body the way this provider would, for CLI-simulated deliveries (relay trigger). */
  sign: (rawBody: string, secret: string) => Record<string, string>;
  /**
   * Builds a minimal-but-valid body (and any extra headers, e.g. GitHub's
   * X-GitHub-Event) for a human-typed event type, so `relay trigger` can
   * simulate a delivery without hand-writing this provider's wire shape.
   */
  buildTestPayload: (
    eventType: string,
    data: Record<string, unknown>,
  ) => { body: unknown; headers?: Record<string, string> };
  /**
   * Type-level carrier for TEventMap so it survives inference through the
   * plugins array. Never set at runtime - it exists only so the compiler can
   * recover the event map from a plugin value.
   */
  readonly $events?: TEventMap;
};

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never;

type IsAny<T> = 0 extends 1 & T ? true : false;

// An `any` event map (e.g. a plugin that went through a cast, or a generic
// factory inferring from the RelayPlugin<any> constraint) must contribute
// nothing rather than poison the merged map into `any`.
type PluginEventMap<TPlugin> =
  TPlugin extends RelayPlugin<infer TEventMap>
    ? IsAny<TEventMap> extends true
      ? {}
      : TEventMap
    : never;

/**
 * The merged event map of a plugins array: each plugin's TEventMap
 * intersected together. Untyped plugins contribute {} (a no-op), an empty
 * plugins array yields {} (every event falls back to the untyped overload).
 */
export type EventMapOf<TPlugins extends readonly RelayPlugin<any>[]> = [
  UnionToIntersection<PluginEventMap<TPlugins[number]>>,
] extends [infer TEventMap]
  ? [TEventMap] extends [never]
    ? {}
    : TEventMap extends Record<string, unknown>
      ? { [K in keyof TEventMap]: TEventMap[K] } // flatten the intersection into one map
      : {}
  : {};

export type RelayHandlerContext = {
  params: { all: string[] };
};

export type Relay<TEventMap extends Record<string, unknown> = {}> = {
  /** Typed registration: event names from the registered plugins' catalogs,
   *  with event.data narrowed to that event's payload type. */
  on<TType extends Extract<keyof TEventMap, string>>(
    type: TType,
    handler: EventHandler<NormalizedEvent<TType, TEventMap[TType]>>,
  ): void;
  /** Untyped fallback: any event name stays legal (custom plugins, forward compat). */
  on(type: string, handler: EventHandler): void;
  ingest: (event: NormalizedEvent) => Promise<Execution>;
  /** Resumes an execution in place, skipping steps that already completed. */
  retryExecution: (executionId: string, reason?: 'manual' | 'scheduled') => Promise<Execution>;
  /** Resumes an execution in place, but re-runs every step regardless of prior state. */
  restartExecution: (executionId: string) => Promise<Execution>;
  /** Creates a brand-new execution from a historical one's event data, leaving
   *  the original untouched. Linked back via Execution.replayedFrom. */
  replayExecution: (executionId: string) => Promise<Execution>;
  listExecutions: () => Promise<Execution[]>;
  listSteps: (executionId: string) => Promise<ExecutionStep[]>;
  listLogs: (executionId: string) => Promise<ExecutionLog[]>;
  handler: (req: Request, ctx: RelayHandlerContext) => Promise<Response>;
};

export type RetryPolicy = {
  maxAttempts: number;
  /** Delay in ms before the next attempt, given the attempt number that just failed. */
  backoff: (attempt: number) => number;
};

export type RelayConfig<
  TPlugins extends readonly RelayPlugin<any>[] = readonly RelayPlugin<any>[],
> = {
  database?: ExecutionStore;
  plugins?: TPlugins;
  retry?: RetryPolicy;
  /** Reject webhook requests with a larger Content-Length before verification/body parsing. */
  maxRequestBodyBytes?: number;
};
