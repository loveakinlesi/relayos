import { pgSchema, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

// All of RelayOS's tables live under their own Postgres schema, not the
// default "public" one, so a consuming app's own tables never collide with
// (or get lost among) the runtime's persistence layer.
export const relayosSchema = pgSchema('relayos');

export const executions = relayosSchema.table('executions', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  eventData: jsonb('event_data').notNull(),
  status: text('status').notNull(),
  attempt: integer('attempt').notNull().default(1),
  replayedFrom: text('replayed_from'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
});

// Append-only: every attempt at a step gets its own row, so a step that
// failed and later succeeded on retry keeps both records instead of one
// being silently overwritten - this is the audit trail for step history.
export const executionSteps = relayosSchema.table('execution_steps', {
  id: text('id').primaryKey(),
  executionId: text('execution_id')
    .notNull()
    .references(() => executions.id),
  name: text('name').notNull(),
  status: text('status').notNull(),
  output: jsonb('output'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const executionLogs = relayosSchema.table('execution_logs', {
  id: text('id').primaryKey(),
  executionId: text('execution_id')
    .notNull()
    .references(() => executions.id),
  level: text('level').notNull(),
  source: text('source').notNull(),
  message: text('message').notNull(),
  data: jsonb('data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
