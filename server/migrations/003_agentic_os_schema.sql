-- Migration: Agentic OS Complete Feature Set
-- Description: Adds all tables for Voice AI, Agency Ecosystem, Multi-Agent, Multimodal, Enterprise features
-- Created: 2026-01-12

-- ========================================
-- AGENCY BILLING ARBITRAGE
-- ========================================

CREATE TABLE IF NOT EXISTS agency_pricing_tiers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Wholesale costs
  wholesale_voice_per_minute REAL DEFAULT 0.10,
  wholesale_premium_tokens_per1k REAL DEFAULT 0.05,
  wholesale_standard_tokens_per1k REAL DEFAULT 0.01,

  -- Retail pricing
  retail_voice_per_minute REAL DEFAULT 0.20,
  retail_premium_tokens_per1k REAL DEFAULT 0.10,
  retail_standard_tokens_per1k REAL DEFAULT 0.02,

  -- Limits
  max_markup_percentage REAL DEFAULT 25.0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_wallets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Balances (in cents)
  balance_cents INTEGER DEFAULT 0,
  lifetime_spent_cents INTEGER DEFAULT 0,

  -- Auto-recharge
  auto_recharge_enabled BOOLEAN DEFAULT FALSE,
  auto_recharge_threshold_cents INTEGER DEFAULT 500,
  auto_recharge_amount_cents INTEGER DEFAULT 5000,

  -- Alerts
  low_balance_alert_sent BOOLEAN DEFAULT FALSE,
  last_alert_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenue_share_ledger (
  id TEXT PRIMARY KEY,

  -- Parties
  agency_organization_id TEXT NOT NULL REFERENCES organizations(id),
  client_organization_id TEXT REFERENCES organizations(id),

  -- Event
  event_type VARCHAR(50) NOT NULL,
  quantity REAL NOT NULL,

  -- Financial (cents)
  wholesale_cost_cents INTEGER NOT NULL,
  retail_charge_cents INTEGER NOT NULL,
  agency_profit_cents INTEGER NOT NULL,

  -- Related resources
  conversation_id TEXT,
  bot_id TEXT REFERENCES bots(id),

  -- Billing cycle
  billed_at TIMESTAMP,
  billing_period_start TIMESTAMP,
  billing_period_end TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_revenue_share_agency ON revenue_share_ledger(agency_organization_id, created_at);
CREATE INDEX idx_revenue_share_client ON revenue_share_ledger(client_organization_id, created_at);

CREATE TABLE IF NOT EXISTS agency_subscription_packages (
  id TEXT PRIMARY KEY,
  agency_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Package
  name VARCHAR(100) NOT NULL,
  description TEXT,
  monthly_price_cents INTEGER NOT NULL,

  -- Included credits
  included_voice_minutes INTEGER DEFAULT 0,
  included_premium_tokens INTEGER DEFAULT 0,
  included_standard_tokens INTEGER DEFAULT 0,

  -- Overage rates
  overage_voice_per_minute REAL,
  overage_premium_tokens_per1k REAL,
  overage_standard_tokens_per1k REAL,

  -- Stripe
  stripe_product_id VARCHAR(255),
  stripe_price_id VARCHAR(255),

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- AGENTIC ACTIONS & TOOL USE
-- ========================================

CREATE TABLE IF NOT EXISTS tool_definitions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Metadata
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'webhook',

  -- Configuration
  config JSON NOT NULL,
  function_schema JSON NOT NULL,

  -- Security
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_threshold JSON,
  auth_type VARCHAR(50),
  encrypted_credentials TEXT,

  -- Usage
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMP,
  average_execution_time_ms INTEGER,

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_tools (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tool_definitions(id) ON DELETE CASCADE,

  enabled BOOLEAN DEFAULT TRUE,
  custom_config JSON,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bot_tools_bot ON bot_tools(bot_id);

CREATE TABLE IF NOT EXISTS action_execution_log (
  id TEXT PRIMARY KEY,

  -- Context
  bot_id TEXT REFERENCES bots(id),
  conversation_id TEXT,
  tool_id TEXT REFERENCES tool_definitions(id),

  -- Execution
  status VARCHAR(50) NOT NULL,
  input_parameters JSON NOT NULL,
  output_data JSON,
  error_message TEXT,

  -- Timing
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER,

  -- Approval
  requires_approval BOOLEAN DEFAULT FALSE,
  approved_by TEXT REFERENCES users(id),
  approved_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_action_execution_bot ON action_execution_log(bot_id, created_at);
CREATE INDEX idx_action_execution_conversation ON action_execution_log(conversation_id);

-- ========================================
-- MULTI-AGENT ORCHESTRATION
-- ========================================

CREATE TABLE IF NOT EXISTS agent_roles (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,

  -- Role
  role_name VARCHAR(100) NOT NULL,
  role_type VARCHAR(50) DEFAULT 'worker',
  description TEXT,

  -- Configuration
  system_prompt TEXT NOT NULL,
  model VARCHAR(100) DEFAULT 'gpt-4o-mini',
  temperature REAL DEFAULT 0.7,

  -- Access
  available_tools JSON DEFAULT '[]',
  knowledge_source_ids JSON DEFAULT '[]',

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_handoff_rules (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,

  -- Routing
  from_role_id TEXT REFERENCES agent_roles(id) ON DELETE CASCADE,
  to_role_id TEXT NOT NULL REFERENCES agent_roles(id) ON DELETE CASCADE,

  -- Trigger
  trigger_type VARCHAR(50) NOT NULL,
  trigger_condition JSON NOT NULL,
  handoff_message TEXT,

  priority INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_memory (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,

  -- Key-value
  memory_key VARCHAR(100) NOT NULL,
  memory_value JSON NOT NULL,

  -- Source
  written_by_role_id TEXT REFERENCES agent_roles(id),

  -- Persistence
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agent_memory_conversation ON agent_memory(conversation_id, memory_key);

-- ========================================
-- VOICE AI ENHANCEMENTS
-- ========================================

CREATE TABLE IF NOT EXISTS voice_session_analytics (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  bot_id TEXT REFERENCES bots(id),

  -- Latency (ms)
  avg_response_latency INTEGER,
  p95_response_latency INTEGER,
  avg_tts_latency INTEGER,
  avg_llm_latency INTEGER,

  -- Quality
  interruption_count INTEGER DEFAULT 0,
  successful_barge_ins INTEGER DEFAULT 0,
  failed_barge_ins INTEGER DEFAULT 0,

  -- Sentiment
  avg_sentiment_score REAL,
  sentiment_progression JSON,
  escalated_to_human BOOLEAN DEFAULT FALSE,
  escalation_reason VARCHAR(100),

  -- Voice
  voice_id VARCHAR(255),
  voice_switch_count INTEGER DEFAULT 0,

  -- Outcome
  call_duration_seconds INTEGER,
  call_status VARCHAR(50),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_voice_analytics_bot ON voice_session_analytics(bot_id, created_at);

CREATE TABLE IF NOT EXISTS sentiment_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,

  -- Sentiment
  sentiment_score REAL NOT NULL,
  sentiment_label VARCHAR(50),

  -- Acoustics
  pitch REAL,
  volume REAL,
  speech_rate REAL,

  -- Context
  user_message TEXT,
  agent_response TEXT,

  -- Actions
  triggered_voice_change BOOLEAN DEFAULT FALSE,
  triggered_escalation BOOLEAN DEFAULT FALSE,

  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sentiment_events_conversation ON sentiment_events(conversation_id, timestamp);

-- ========================================
-- DOCUMENT GENERATION
-- ========================================

CREATE TABLE IF NOT EXISTS document_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,

  -- Metadata
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,

  -- Content
  template_content TEXT NOT NULL,
  required_fields JSON NOT NULL,
  optional_fields JSON DEFAULT '[]',

  -- Styling
  css_styles TEXT,
  header_html TEXT,
  footer_html TEXT,

  -- Access
  is_public BOOLEAN DEFAULT FALSE,
  is_system_template BOOLEAN DEFAULT FALSE,

  -- Usage
  usage_count INTEGER DEFAULT 0,

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generated_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),

  -- Template
  template_id TEXT REFERENCES document_templates(id),

  -- Generated
  document_name VARCHAR(255) NOT NULL,
  field_values JSON NOT NULL,
  rendered_html TEXT,

  -- Files
  pdf_url VARCHAR(500),
  docx_url VARCHAR(500),

  -- Context
  conversation_id TEXT,
  bot_id TEXT REFERENCES bots(id),

  -- Delivery
  emailed_to VARCHAR(255),
  emailed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_generated_documents_org ON generated_documents(organization_id, created_at);

-- ========================================
-- MULTIMODAL (VISION)
-- ========================================

CREATE TABLE IF NOT EXISTS vision_analysis_results (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  bot_id TEXT REFERENCES bots(id),

  -- Image
  image_url VARCHAR(500) NOT NULL,
  image_type VARCHAR(50),

  -- Analysis
  analysis_prompt TEXT,
  analysis_result TEXT NOT NULL,
  extracted_text TEXT,
  extracted_data JSON,

  -- Model
  model VARCHAR(100) DEFAULT 'gpt-4o',
  prompt_tokens INTEGER,
  completion_tokens INTEGER,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vision_analysis_conversation ON vision_analysis_results(conversation_id);

-- ========================================
-- INDUSTRY SNAPSHOTS
-- ========================================

CREATE TABLE IF NOT EXISTS industry_snapshots (
  id TEXT PRIMARY KEY,

  -- Metadata
  name VARCHAR(255) NOT NULL,
  industry VARCHAR(100) NOT NULL,
  description TEXT,
  thumbnail_url VARCHAR(500),

  -- Configuration
  bot_config JSON NOT NULL,
  knowledge_base_content TEXT,
  included_tools JSON DEFAULT '[]',

  -- Pricing
  price_type VARCHAR(50) DEFAULT 'free',
  price_cents INTEGER DEFAULT 0,

  -- Marketplace
  created_by_organization_id TEXT REFERENCES organizations(id),
  is_marketplace_template BOOLEAN DEFAULT FALSE,
  commission_rate REAL DEFAULT 0.20,

  -- Usage
  install_count INTEGER DEFAULT 0,
  rating REAL,
  review_count INTEGER DEFAULT 0,

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS snapshot_installations (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES industry_snapshots(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Created
  created_bot_id TEXT REFERENCES bots(id),
  customizations JSON,

  -- Payment
  paid_amount_cents INTEGER DEFAULT 0,
  stripe_payment_intent_id VARCHAR(255),

  installed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_snapshot_installations_org ON snapshot_installations(organization_id);

-- ========================================
-- ENTERPRISE SECURITY
-- ========================================

CREATE TABLE IF NOT EXISTS pii_redaction_rules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Rule
  rule_name VARCHAR(100) NOT NULL,
  pii_type VARCHAR(50) NOT NULL,
  detection_pattern TEXT NOT NULL,

  -- Redaction
  redaction_strategy VARCHAR(50) DEFAULT 'mask',
  replacement_text VARCHAR(100) DEFAULT '[REDACTED]',

  -- Scope
  apply_to_logs BOOLEAN DEFAULT TRUE,
  apply_to_llm_input BOOLEAN DEFAULT TRUE,
  apply_to_storage BOOLEAN DEFAULT TRUE,

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS byok_configurations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Provider
  provider VARCHAR(50) NOT NULL,
  encrypted_api_key TEXT NOT NULL,

  -- Usage
  total_tokens_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,

  -- Health
  last_health_check_at TIMESTAMP,
  is_healthy BOOLEAN DEFAULT TRUE,
  last_error_message TEXT,

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

CREATE INDEX idx_agency_pricing_org ON agency_pricing_tiers(organization_id);
CREATE INDEX idx_usage_wallets_org ON usage_wallets(organization_id);
CREATE INDEX idx_tool_definitions_org ON tool_definitions(organization_id);
CREATE INDEX idx_agent_roles_bot ON agent_roles(bot_id);
CREATE INDEX idx_document_templates_org ON document_templates(organization_id);
CREATE INDEX idx_document_templates_category ON document_templates(category) WHERE active = TRUE;
CREATE INDEX idx_industry_snapshots_industry ON industry_snapshots(industry) WHERE active = TRUE;
CREATE INDEX idx_pii_redaction_org ON pii_redaction_rules(organization_id);
CREATE INDEX idx_byok_org ON byok_configurations(organization_id);
