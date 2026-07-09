export type NormalizedEvent = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  receivedAt: string;
};

export type EventHandler = (event: NormalizedEvent) => void | Promise<void>;

export type Relay = {
  on: (type: string, handler: EventHandler) => void;
  ingest: (event: NormalizedEvent) => Promise<void>;
};

export function createRelay(): Relay {
  const handlers = new Map<string, EventHandler[]>();

  return {
    on(type, handler) {
      const existing = handlers.get(type) ?? [];
      existing.push(handler);
      handlers.set(type, existing);
    },
    async ingest(event) {
      const matched = handlers.get(event.type) ?? [];
      for (const handler of matched) {
        await handler(event);
      }
    },
  };
}
