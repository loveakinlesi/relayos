import { pgTable, text, timestamp, jsonb, integer, unique } from 'drizzle-orm/pg-core';

export const executions = pgTable('executions', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  eventData: jsonb('event_data').notNull(),
  status: text('status').notNull(),
  attempt: integer('attempt').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
});

export const executionSteps = pgTable(
  'execution_steps',
  {
    id: text('id').primaryKey(),
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id),
    name: text('name').notNull(),
    status: text('status').notNull(),
    output: jsonb('output'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [unique().on(table.executionId, table.name)],
);
