export type NormalizedEvent = {
  id: string;
  type: string;
  data: Record<string, unknown>;
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

export type EventHandler = (
  event: NormalizedEvent,
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

export function createMemoryExecutionStore(): ExecutionStore {
  const executions = new Map<string, Execution>();
  const steps: ExecutionStep[] = [];
  const logs: ExecutionLog[] = [];

  return {
    async create(execution) {
      // No await between the check and the set, so nothing can interleave -
      // this is atomic against other concurrent calls in this process.
      const conflict = Array.from(executions.values()).some(
        (existing) => existing.eventId === execution.eventId,
      );
      if (conflict) return false;
      executions.set(execution.id, execution);
      return true;
    },
    async update(id, patch) {
      const existing = executions.get(id);
      if (!existing) return;
      executions.set(id, { ...existing, ...patch });
    },
    async list() {
      return Array.from(executions.values()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    },
    async get(id) {
      return executions.get(id);
    },
    async findByEventId(eventId) {
      return Array.from(executions.values()).find((execution) => execution.eventId === eventId);
    },
    async getStep(executionId, name) {
      const matches = steps.filter((step) => step.executionId === executionId && step.name === name);
      return matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    },
    async saveStep(step) {
      steps.push(step);
    },
    async listSteps(executionId) {
      return steps
        .filter((step) => step.executionId === executionId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async saveLog(log) {
      logs.push(log);
    },
    async listLogs(executionId) {
      return logs.filter((log) => log.executionId === executionId);
    },
  };
}

export type RelayPlugin = {
  /** Also the URL segment providers are mounted at, e.g. "stripe" -> /api/relay/stripe */
  id: string;
  verify: (req: Request) => Promise<boolean>;
  normalize: (rawBody: unknown, headers: Headers) => NormalizedEvent;
};

export type RelayHandlerContext = {
  params: { all: string[] };
};

export type Relay = {
  on: (type: string, handler: EventHandler) => void;
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

const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  backoff: (attempt) => Math.min(1000 * 2 ** (attempt - 1), 30_000),
};

export type RelayConfig = {
  database?: ExecutionStore;
  plugins?: RelayPlugin[];
  retry?: RetryPolicy;
};

export function createRelay(config: RelayConfig = {}): Relay {
  const handlers = new Map<string, EventHandler[]>();
  const store = config.database ?? createMemoryExecutionStore();
  const plugins = new Map((config.plugins ?? []).map((plugin) => [plugin.id, plugin]));
  const retryPolicy = config.retry ?? defaultRetryPolicy;

  function logSystemEvent(executionId: string, message: string, data?: unknown): Promise<void> {
    return store.saveLog({
      id: crypto.randomUUID(),
      executionId,
      level: 'info',
      source: 'system',
      message,
      data,
      createdAt: new Date().toISOString(),
    });
  }

  function createStepRunner(
    executionId: string,
    options: { forceRerun?: boolean } = {},
  ): RuntimeContext['step'] {
    return {
      async run(name, fn) {
        const existing = options.forceRerun ? undefined : await store.getStep(executionId, name);
        // A step whose most recent attempt completed is never re-run - its
        // cached output is returned as-is. A step with no record, one that
        // previously failed, or any step at all when forceRerun (restart) is
        // set, is (re)run so progress can actually resume past it.
        if (existing?.status === 'completed') {
          return existing.output as Awaited<ReturnType<typeof fn>>;
        }

        try {
          const output = await fn();
          await store.saveStep({
            id: crypto.randomUUID(),
            executionId,
            name,
            status: 'completed',
            output,
            createdAt: new Date().toISOString(),
          });
          return output;
        } catch (err) {
          await store.saveStep({
            id: crypto.randomUUID(),
            executionId,
            name,
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
            createdAt: new Date().toISOString(),
          });
          throw err;
        }
      },
    };
  }

  function createLogger(executionId: string): {
    log: RuntimeContext['log'];
    flush: () => Promise<void>;
  } {
    const pending: Promise<void>[] = [];
    const consoleByLevel: Record<LogLevel, (...args: unknown[]) => void> = {
      debug: console.debug,
      info: console.log,
      warn: console.warn,
      error: console.error,
    };

    function write(level: LogLevel, message: string, data?: unknown) {
      consoleByLevel[level](`[relayos:${level}]`, message, data ?? '');
      pending.push(
        store.saveLog({
          id: crypto.randomUUID(),
          executionId,
          level,
          source: 'handler',
          message,
          data,
          createdAt: new Date().toISOString(),
        }),
      );
    }

    return {
      log: {
        debug: (message, data) => write('debug', message, data),
        info: (message, data) => write('info', message, data),
        warn: (message, data) => write('warn', message, data),
        error: (message, data) => write('error', message, data),
      },
      async flush() {
        await Promise.all(pending);
      },
    };
  }

  // Ensures only one runHandlers() is ever active for a given execution id at
  // once. Without this, an auto-retry timer firing at the same moment as a
  // manual retry call (or two manual retries in quick succession) would both
  // run the handler concurrently - double-executing side effects and racing
  // on step/log writes and the final store.update(). A second concurrent
  // call piggybacks on the first's in-flight promise instead of starting a
  // redundant attempt. This only guards a single process; a multi-instance
  // deployment would need a database-level lock instead.
  const inFlight = new Map<string, Promise<Execution>>();

  function runExclusive(executionId: string, fn: () => Promise<Execution>): Promise<Execution> {
    const existing = inFlight.get(executionId);
    if (existing) return existing;

    const promise = fn().finally(() => {
      inFlight.delete(executionId);
    });
    inFlight.set(executionId, promise);
    return promise;
  }

  function scheduleRetry(executionId: string, delayMs: number) {
    setTimeout(() => {
      retryExecution(executionId, 'scheduled').catch((err) => {
        console.error(`[relayos] scheduled retry failed for execution ${executionId}`, err);
      });
    }, delayMs);
  }

  async function runHandlers(
    execution: Execution,
    event: NormalizedEvent,
    stepOptions: { forceRerun?: boolean } = {},
  ): Promise<Execution> {
    const matched = handlers.get(event.type) ?? [];
    const { log, flush } = createLogger(execution.id);
    const ctx: RuntimeContext = { step: createStepRunner(execution.id, stepOptions), log };

    try {
      for (const handler of matched) {
        await handler(event, ctx);
      }
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      execution.error = undefined;
    } catch (err) {
      execution.status = 'failed';
      execution.completedAt = new Date().toISOString();
      execution.error = err instanceof Error ? err.message : String(err);
    }
    await flush();
    await store.update(execution.id, execution);

    if (execution.status === 'failed' && execution.attempt < retryPolicy.maxAttempts) {
      scheduleRetry(execution.id, retryPolicy.backoff(execution.attempt));
    }

    return execution;
  }

  async function ingest(event: NormalizedEvent): Promise<Execution> {
    // Fast path: providers redeliver seconds apart on timeout, so this
    // avoids a wasted insert attempt for the common sequential-retry case.
    const existing = await store.findByEventId(event.id);
    if (existing) {
      return existing;
    }

    const execution: Execution = {
      id: crypto.randomUUID(),
      eventId: event.id,
      eventType: event.type,
      eventData: event.data,
      status: 'pending',
      attempt: 1,
      createdAt: new Date().toISOString(),
    };

    // Authoritative guard: if two requests for the same eventId raced past
    // the check above, only one of these inserts actually lands - create()
    // is atomic (a single INSERT ... ON CONFLICT DO NOTHING at the Postgres
    // store), so the loser detects the conflict here instead of both
    // proceeding to run handlers.
    const created = await store.create(execution);
    if (!created) {
      const winner = await store.findByEventId(event.id);
      if (winner) return winner;
      throw new Error(`event "${event.id}" is already being ingested`);
    }

    await logSystemEvent(execution.id, 'event ingested', {
      eventId: event.id,
      eventType: event.type,
    });

    return runExclusive(execution.id, () => runHandlers(execution, event));
  }

  async function retryExecution(
    executionId: string,
    reason: 'manual' | 'scheduled' = 'manual',
  ): Promise<Execution> {
    return runExclusive(executionId, async () => {
      const execution = await store.get(executionId);
      if (!execution) {
        throw new Error(`no execution found with id "${executionId}"`);
      }

      execution.attempt += 1;
      await logSystemEvent(execution.id, `retrying (attempt ${execution.attempt}, ${reason})`);

      const event: NormalizedEvent = {
        id: execution.eventId,
        type: execution.eventType,
        data: execution.eventData,
        receivedAt: execution.createdAt,
      };

      return runHandlers(execution, event);
    });
  }

  async function restartExecution(executionId: string): Promise<Execution> {
    return runExclusive(executionId, async () => {
      const execution = await store.get(executionId);
      if (!execution) {
        throw new Error(`no execution found with id "${executionId}"`);
      }

      execution.attempt += 1;
      await logSystemEvent(
        execution.id,
        `restarting (attempt ${execution.attempt}) - all steps will re-run`,
      );

      const event: NormalizedEvent = {
        id: execution.eventId,
        type: execution.eventType,
        data: execution.eventData,
        receivedAt: execution.createdAt,
      };

      return runHandlers(execution, event, { forceRerun: true });
    });
  }

  async function replayExecution(executionId: string): Promise<Execution> {
    const source = await store.get(executionId);
    if (!source) {
      throw new Error(`no execution found with id "${executionId}"`);
    }

    // A fresh eventId, not the source's - this is an intentional, explicit
    // re-processing of historical event data, not a redelivery of the same
    // webhook, so it shouldn't be deduped against (or dedupe) the original.
    const event: NormalizedEvent = {
      id: crypto.randomUUID(),
      type: source.eventType,
      data: source.eventData,
      receivedAt: new Date().toISOString(),
    };

    const execution: Execution = {
      id: crypto.randomUUID(),
      eventId: event.id,
      eventType: event.type,
      eventData: event.data,
      status: 'pending',
      attempt: 1,
      replayedFrom: source.id,
      createdAt: new Date().toISOString(),
    };

    const created = await store.create(execution);
    if (!created) {
      throw new Error('failed to create replay execution (unexpected eventId collision)');
    }

    await logSystemEvent(execution.id, `replayed from execution ${source.id}`, {
      sourceExecutionId: source.id,
    });

    return runExclusive(execution.id, () => runHandlers(execution, event));
  }

  return {
    on(type, handler) {
      const existing = handlers.get(type) ?? [];
      existing.push(handler);
      handlers.set(type, existing);
    },
    ingest,
    retryExecution,
    restartExecution,
    replayExecution,
    listExecutions() {
      return store.list();
    },
    listSteps(executionId) {
      return store.listSteps(executionId);
    },
    listLogs(executionId) {
      return store.listLogs(executionId);
    },
    async handler(req, ctx) {
      const pluginId = ctx.params.all[0];
      const plugin = pluginId ? plugins.get(pluginId) : undefined;
      if (!plugin) {
        return Response.json({ error: `unknown provider "${pluginId}"` }, { status: 404 });
      }

      const verified = await plugin.verify(req.clone());
      if (!verified) {
        return Response.json({ error: 'invalid signature' }, { status: 401 });
      }

      const rawBody = await req.json();
      const event = plugin.normalize(rawBody, req.headers);
      const execution = await ingest(event);

      return Response.json({ execution });
    },
  };
}
