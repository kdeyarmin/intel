-- AI Assistant (server/lib/assistant): saved conversations, the API content of
-- every turn kept verbatim and append-only, lead lists the assistant proposed
-- (created only when the user confirms), and per-user daily token use.
CREATE TABLE IF NOT EXISTS "assistant_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_conversations_user_idx" ON "assistant_conversations" ("user_id", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_turns" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"error" text,
	"model" varchar(100),
	"usage" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	CONSTRAINT "assistant_turns_conversation_id_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_turns_conversation_idx" ON "assistant_turns" ("conversation_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"turn_id" integer NOT NULL,
	"seq" integer NOT NULL,
	"role" varchar(10) NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_messages_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "assistant_messages_turn_id_assistant_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."assistant_turns"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_messages_conversation_seq_uq" ON "assistant_messages" ("conversation_id", "seq");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_actions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"turn_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"tool_use_id" varchar(100) NOT NULL,
	"kind" varchar(40) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'proposed' NOT NULL,
	"result" jsonb,
	"expires_at" timestamp NOT NULL,
	"decided_at" timestamp,
	"reported_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_actions_conversation_id_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "assistant_actions_turn_id_assistant_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."assistant_turns"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "assistant_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_actions_conversation_idx" ON "assistant_actions" ("conversation_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_usage" (
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"units" bigint DEFAULT 0 NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "assistant_usage_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "assistant_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
