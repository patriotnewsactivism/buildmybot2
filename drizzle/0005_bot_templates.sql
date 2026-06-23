CREATE TABLE IF NOT EXISTS "bot_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(256) NOT NULL,
	"industry" varchar(256) NOT NULL,
	"system_prompt" text NOT NULL,
	"knowledge_base_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lead_capture_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"voice_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"installCount" integer DEFAULT 0 NOT NULL,
	"rating" numeric(3,2) DEFAULT 0.00 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bot_templates_name_idx" ON "bot_templates" ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_templates_industry_idx" ON "bot_templates" ("industry");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_templates_rating_idx" ON "bot_templates" ("rating");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_templates_installCount_idx" ON "bot_templates" ("installCount");