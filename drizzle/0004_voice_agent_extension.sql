-- Extend voice_agents with provider-agnostic fields
ALTER TABLE "voice_agents" ADD COLUMN "provider" varchar(20) NOT NULL DEFAULT 'vapi';
ALTER TABLE "voice_agents" ADD COLUMN "provider_agent_id" varchar(255);
ALTER TABLE "voice_agents" ADD COLUMN "voice_name" varchar(100);
ALTER TABLE "voice_agents" ADD COLUMN "system_prompt" text NOT NULL DEFAULT 'You are a helpful AI receptionist.';
ALTER TABLE "voice_agents" ADD COLUMN "business_hours" jsonb DEFAULT '{}';
ALTER TABLE "voice_agents" ADD COLUMN "after_hours_message" text DEFAULT 'We are currently closed. Please leave a message and we will get back to you.';
ALTER TABLE "voice_agents" ADD COLUMN "calendar_booking_url" varchar(500);
ALTER TABLE "voice_agents" ADD COLUMN "max_call_duration" integer DEFAULT 600;
ALTER TABLE "voice_agents" ADD COLUMN "record_calls" boolean DEFAULT true;
ALTER TABLE "voice_agents" ADD COLUMN "escalation_rules" jsonb DEFAULT '[]';
ALTER TABLE "voice_agents" ADD COLUMN "end_call_phrases" jsonb DEFAULT '["goodbye","that is all","no more questions"]';
ALTER TABLE "voice_agents" ADD COLUMN "is_active" boolean DEFAULT true;

-- Phone numbers assigned to voice agents
CREATE TABLE "phone_numbers" (
  "id" serial PRIMARY KEY,
  "voice_agent_id" text REFERENCES "voice_agents"("id") ON DELETE SET NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" varchar(20) NOT NULL,
  "provider_number_id" varchar(255),
  "phone_number" varchar(20) NOT NULL UNIQUE,
  "friendly_name" varchar(100),
  "capabilities" jsonb DEFAULT '{"voice": true, "sms": true}',
  "monthly_cost" numeric(10,4),
  "status" varchar(20) DEFAULT 'active',
  "created_at" timestamp DEFAULT now()
);

-- Call logs for voice agents
CREATE TABLE "call_logs" (
  "id" serial PRIMARY KEY,
  "voice_agent_id" text NOT NULL REFERENCES "voice_agents"("id") ON DELETE CASCADE,
  "bot_id" text NOT NULL REFERENCES "bots"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "call_sid" varchar(255) UNIQUE,
  "provider" varchar(20) NOT NULL,
  "direction" varchar(10) NOT NULL,
  "caller_number" varchar(20),
  "called_number" varchar(20),
  "status" varchar(20) DEFAULT 'initiated',
  "duration" integer,
  "cost" numeric(10,4),
  "transcript" jsonb DEFAULT '[]',
  "summary" text,
  "sentiment" varchar(20),
  "lead_score" integer DEFAULT 0,
  "lead_id" text REFERENCES "leads"("id"),
  "recording_url" text,
  "metadata" jsonb DEFAULT '{}',
  "started_at" timestamp,
  "ended_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

-- Voice usage tracking for billing
CREATE TABLE "voice_usage" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "voice_agent_id" text NOT NULL REFERENCES "voice_agents"("id") ON DELETE CASCADE,
  "call_log_id" integer REFERENCES "call_logs"("id") ON DELETE SET NULL,
  "minutes_used" numeric(10,2) NOT NULL,
  "cost_per_minute" numeric(10,4) NOT NULL,
  "total_cost" numeric(10,4) NOT NULL,
  "billing_period_start" date NOT NULL,
  "billing_period_end" date NOT NULL,
  "reported_to_stripe" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);
