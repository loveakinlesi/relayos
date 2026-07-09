import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const executions = pgTable('executions', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
});
