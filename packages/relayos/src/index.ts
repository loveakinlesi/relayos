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
  };
}

export type Relay = {
  on: (type: string, handler: EventHandler) => void;
  ingest: (event: NormalizedEvent) => Promise<Execution>;
  listExecutions: () => Promise<Execution[]>;
};

export type CreateRelayOptions = {
  store?: ExecutionStore;
};

export function createRelay(options: CreateRelayOptions = {}): Relay {
  const handlers = new Map<string, EventHandler[]>();
  const store = options.store ?? createMemoryExecutionStore();

  return {
    on(type, handler) {
      const existing = handlers.get(type) ?? [];
      existing.push(handler);
      handlers.set(type, existing);
    },
    async ingest(event) {
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
    },
    listExecutions() {
      return store.list();
    },
  };
}
