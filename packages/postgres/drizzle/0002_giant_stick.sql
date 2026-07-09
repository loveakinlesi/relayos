CREATE TABLE "execution_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"output" jsonb,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "execution_steps_execution_id_name_unique" UNIQUE("execution_id","name")
);
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "event_data" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE no action ON UPDATE no action;