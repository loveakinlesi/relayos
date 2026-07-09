export type NormalizedEvent = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  receivedAt: string;
};

export type EventHandler = (event: NormalizedEvent) => void | Promise<void>;

export type ExecutionStatus = 'pending' | 'completed' | 'failed';

export type Execution = {
  id: string;
  eventId: string;
  eventType: string;
  status: ExecutionStatus;
  createdAt: string;
  completedAt?: string;
  error?: string;
};

export type ExecutionStore = {
  create: (execution: Execution) => Promise<void>;
  update: (id: string, patch: Partial<Execution>) => Promise<void>;
  list: () => Promise<Execution[]>;
  findByEventId: (eventId: string) => Promise<Execution | undefined>;
};

export function createMemoryExecutionStore(): ExecutionStore {
  const executions = new Map<string, Execution>();

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
    async findByEventId(eventId) {
      return Array.from(executions.values()).find((execution) => execution.eventId === eventId);
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
  listExecutions: () => Promise<Execution[]>;
  handler: (req: Request, ctx: RelayHandlerContext) => Promise<Response>;
};

export type RelayConfig = {
  database?: ExecutionStore;
  plugins?: RelayPlugin[];
};

export function createRelay(config: RelayConfig = {}): Relay {
  const handlers = new Map<string, EventHandler[]>();
  const store = config.database ?? createMemoryExecutionStore();
  const plugins = new Map((config.plugins ?? []).map((plugin) => [plugin.id, plugin]));

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
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await store.create(execution);

    const matched = handlers.get(event.type) ?? [];
    try {
      for (const handler of matched) {
        await handler(event);
      }
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
    } catch (err) {
      execution.status = 'failed';
      execution.completedAt = new Date().toISOString();
      execution.error = err instanceof Error ? err.message : String(err);
    }
    await store.update(execution.id, execution);

    return execution;
  }

  return {
    on(type, handler) {
      const existing = handlers.get(type) ?? [];
      existing.push(handler);
      handlers.set(type, existing);
    },
    ingest,
    listExecutions() {
      return store.list();
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
