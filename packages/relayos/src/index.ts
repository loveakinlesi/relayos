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

export type ExecutionLog = {
  id: string;
  executionId: string;
  level: LogLevel;
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
  createdAt: string;
  completedAt?: string;
  error?: string;
};

export type ExecutionStore = {
  create: (execution: Execution) => Promise<void>;
  update: (id: string, patch: Partial<Execution>) => Promise<void>;
  list: () => Promise<Execution[]>;
  get: (id: string) => Promise<Execution | undefined>;
  findByEventId: (eventId: string) => Promise<Execution | undefined>;
  getStep: (executionId: string, name: string) => Promise<ExecutionStep | undefined>;
  saveStep: (step: ExecutionStep) => Promise<void>;
  listSteps: (executionId: string) => Promise<ExecutionStep[]>;
  saveLog: (log: ExecutionLog) => Promise<void>;
  listLogs: (executionId: string) => Promise<ExecutionLog[]>;
};

export function createMemoryExecutionStore(): ExecutionStore {
  const executions = new Map<string, Execution>();
  const steps = new Map<string, ExecutionStep>();
  const logs: ExecutionLog[] = [];

  return {
    async create(execution) {
      executions.set(execution.id, execution);
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
      return steps.get(`${executionId}:${name}`);
    },
    async saveStep(step) {
      steps.set(`${step.executionId}:${step.name}`, step);
    },
    async listSteps(executionId) {
      return Array.from(steps.values()).filter((step) => step.executionId === executionId);
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
  retryExecution: (executionId: string) => Promise<Execution>;
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

  function createStepRunner(executionId: string): RuntimeContext['step'] {
    return {
      async run(name, fn) {
        const existing = await store.getStep(executionId, name);
        // A step that already completed is never re-run - its cached output
        // is returned as-is. A step with no record, or one that previously
        // failed, is (re)run so a retry can actually make progress past it.
        if (existing?.status === 'completed') {
          return existing.output as Awaited<ReturnType<typeof fn>>;
        }

        try {
          const output = await fn();
          await store.saveStep({
            id: existing?.id ?? crypto.randomUUID(),
            executionId,
            name,
            status: 'completed',
            output,
            createdAt: new Date().toISOString(),
          });
          return output;
        } catch (err) {
          await store.saveStep({
            id: existing?.id ?? crypto.randomUUID(),
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

  function scheduleRetry(executionId: string, delayMs: number) {
    setTimeout(() => {
      retryExecution(executionId).catch((err) => {
        console.error(`[relayos] scheduled retry failed for execution ${executionId}`, err);
      });
    }, delayMs);
  }

  async function runHandlers(execution: Execution, event: NormalizedEvent): Promise<Execution> {
    const matched = handlers.get(event.type) ?? [];
    const { log, flush } = createLogger(execution.id);
    const ctx: RuntimeContext = { step: createStepRunner(execution.id), log };

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
    // Best-effort dedup: providers redeliver on timeout, so a retry arriving
    // after the first attempt started should return the existing execution
    // instead of running handlers again. Concurrent duplicates within the
    // same instant can still race past this check (no locking yet).
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
    await store.create(execution);

    return runHandlers(execution, event);
  }

  async function retryExecution(executionId: string): Promise<Execution> {
    const execution = await store.get(executionId);
    if (!execution) {
      throw new Error(`no execution found with id "${executionId}"`);
    }

    execution.attempt += 1;
    const event: NormalizedEvent = {
      id: execution.eventId,
      type: execution.eventType,
      data: execution.eventData,
      receivedAt: execution.createdAt,
    };

    return runHandlers(execution, event);
  }

  return {
    on(type, handler) {
      const existing = handlers.get(type) ?? [];
      existing.push(handler);
      handlers.set(type, existing);
    },
    ingest,
    retryExecution,
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
