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

export type Relay = {
  on: (type: string, handler: EventHandler) => void;
  ingest: (event: NormalizedEvent) => Promise<Execution>;
  listExecutions: () => Execution[];
};

export function createRelay(): Relay {
  const handlers = new Map<string, EventHandler[]>();
  const executions = new Map<string, Execution>();

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
      executions.set(execution.id, execution);

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

      return execution;
    },
    listExecutions() {
      return Array.from(executions.values()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    },
  };
}
