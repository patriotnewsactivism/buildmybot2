-- AI Employees tables
-- Run this in the Supabase Dashboard SQL Editor

CREATE TABLE IF NOT EXISTS ai_employees (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(100) NOT NULL,
  avatar TEXT,
  description TEXT,
  instructions TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  last_active_at TIMESTAMP,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_today INTEGER NOT NULL DEFAULT 0,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_addresses JSONB,
  schedule JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_employee_logs (
  id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES ai_employees(id) ON DELETE CASCADE,
  organization_id TEXT,
  employee_name VARCHAR(100),
  role VARCHAR(100),
  task_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  summary TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_employees_org ON ai_employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_employees_status ON ai_employees(status);
CREATE INDEX IF NOT EXISTS idx_ai_employee_logs_employee ON ai_employee_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_ai_employee_logs_created ON ai_employee_logs(created_at DESC);

INSERT INTO ai_employees (id, name, role, avatar, description, instructions, status, email_enabled, tasks_completed, tasks_today)
VALUES
  ('sam-support', 'Sam', 'Customer Support Agent', '🎧', 'Handles customer emails, support tickets, and live chat escalations. Always friendly, always helpful.', 'You are Sam, the Customer Support Agent for BuildMyBot. You are warm, empathetic, and solution-oriented.', 'active', true, 0, 0),
  ('eli-engineering', 'Eli', 'Engineering Agent', '⚙️', 'Monitors bot health, checks deployments, triages technical issues. Thinks in systems.', 'You are Eli, the Engineering Agent for BuildMyBot. You are precise, analytical, and think in systems.', 'active', false, 0, 0),
  ('maya-marketing', 'Maya', 'Marketing Agent', '📈', 'Creates marketing content, social media posts, and blog drafts. Creative and data-driven.', 'You are Maya, the Marketing Agent for BuildMyBot. You are creative, energetic, and data-driven.', 'active', false, 0, 0),
  ('oscar-operations', 'Oscar', 'Operations Agent', '📊', 'Runs daily operations: system health checks, usage stats, team standup.', 'You are Oscar, the Operations Agent for BuildMyBot. You are organized, thorough, and calm under pressure.', 'active', false, 0, 0),
  ('piper-product', 'Piper', 'Product Agent', '🎯', 'Analyzes user feedback, generates feature ideas, and tracks the product roadmap.', 'You are Piper, the Product Agent for BuildMyBot. You are customer-obsessed and think in user journeys.', 'active', false, 0, 0)
ON CONFLICT (id) DO NOTHING;
