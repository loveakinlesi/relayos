CREATE SCHEMA "relayos";
--> statement-breakpoint
CREATE TABLE "relayos"."execution_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relayos"."execution_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"output" jsonb,
	"error" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relayos"."executions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_data" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"replayed_from" text,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "executions_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "relayos"."execution_logs" ADD CONSTRAINT "execution_logs_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "relayos"."executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relayos"."execution_steps" ADD CONSTRAINT "execution_steps_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "relayos"."executions"("id") ON DELETE no action ON UPDATE no action;