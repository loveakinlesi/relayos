import type {
  EventHandler,
  EventMapOf,
  Execution,
  LogLevel,
  NormalizedEvent,
  Relay,
  RelayConfig,
  RelayPlugin,
  RetryPolicy,
  RuntimeContext,
} from './types';
import { resolveDatabase } from './db/resolve';

const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  backoff: (attempt) => Math.min(1000 * 2 ** (attempt - 1), 30_000),
};

const defaultMaxRequestBodyBytes = 10 * 1024 * 1024;

/**
 * The engine registers handlers untyped internally - the typed `on` overloads
 * exist only on the public Relay surface, and the runtime dispatches purely by
 * the event-type string either way.
 */
type RelayInternal = Omit<Relay, 'on'> & {
  on: (type: string, handler: EventHandler) => void;
};

export function createRelayEngine<const TPlugins extends readonly RelayPlugin<any>[] = []>(
  config: RelayConfig<TPlugins>,
): Relay<EventMapOf<TPlugins>> {
  const handlers = new Map<string, EventHandler[]>();
  const { store, migrate } = resolveDatabase(config.database);

  let migrated: Promise<void> | undefined;
  function ensureMigrated(): Promise<void> {
    if (process.env['NODE_ENV'] === 'production') return Promise.resolve();
    if (!migrated) migrated = migrate();
    return migrated;
  }

  const plugins = new Map<string, RelayPlugin<any>>(
    (config.plugins ?? []).map((plugin) => [plugin.id, plugin]),
  );
  const retryPolicy = config.retry ?? defaultRetryPolicy;
  const maxRequestBodyBytes = config.maxRequestBodyBytes ?? defaultMaxRequestBodyBytes;

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
      consoleByLevel[level](`[restaq:${level}]`, message, data ?? '');
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
        console.error(`[restaq] scheduled retry failed for execution ${executionId}`, err);
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
    await ensureMigrated();

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
    await ensureMigrated();
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
    await ensureMigrated();
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
    await ensureMigrated();
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

  const relay: RelayInternal = {
    on(type, handler) {
      const existing = handlers.get(type) ?? [];
      existing.push(handler);
      handlers.set(type, existing);
    },
    ingest,
    retryExecution,
    restartExecution,
    replayExecution,
    async listExecutions() {
      await ensureMigrated();
      return store.list();
    },
    async listSteps(executionId) {
      await ensureMigrated();
      return store.listSteps(executionId);
    },
    async listLogs(executionId) {
      await ensureMigrated();
      return store.listLogs(executionId);
    },
    migrate,
    async handler(req, ctx) {
      const pluginId = ctx.params.all[0];
      const plugin = pluginId ? plugins.get(pluginId) : undefined;
      if (!plugin) {
        return Response.json({ error: `unknown provider "${pluginId}"` }, { status: 404 });
      }

      const contentLength = req.headers.get('content-length');
      if (contentLength) {
        const bodyBytes = Number(contentLength);
        if (Number.isFinite(bodyBytes) && bodyBytes > maxRequestBodyBytes) {
          return Response.json({ error: 'request body too large' }, { status: 413 });
        }
      }

      const verified = await plugin.verify(req.clone());
      if (!verified) {
        return Response.json({ error: 'invalid signature' }, { status: 401 });
      }

      let rawBody: unknown;
      try {
        rawBody = await req.json();
      } catch {
        return Response.json({ error: 'invalid JSON payload' }, { status: 400 });
      }

      let event: NormalizedEvent;
      try {
        event = plugin.normalize(rawBody, req.headers);
      } catch {
        return Response.json({ error: 'invalid provider payload' }, { status: 400 });
      }

      let execution: Execution;
      try {
        execution = await ingest(event);
      } catch {
        return Response.json({ error: 'failed to ingest event' }, { status: 500 });
      }

      return Response.json({ execution });
    },
  };

  return relay as Relay<EventMapOf<TPlugins>>;
}
