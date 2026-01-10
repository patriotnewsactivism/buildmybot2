-- ============================================
-- BUILDMYBOT PHASE 1 MIGRATION
-- Multi-Tenant Architecture Implementation
-- ============================================

-- Create Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  owner_id TEXT,
  plan VARCHAR(50) DEFAULT 'FREE',
  subscription_status VARCHAR(50) DEFAULT 'active',
  settings JSONB DEFAULT '{}',
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create Organization Members table
CREATE TABLE IF NOT EXISTS organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  permissions JSONB DEFAULT '[]',
  invited_by TEXT REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Create Roles table
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '[]',
  is_system_role BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  user_id TEXT REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create Partner Clients table
CREATE TABLE IF NOT EXISTS partner_clients (
  id TEXT PRIMARY KEY,
  partner_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  client_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  access_level VARCHAR(50) DEFAULT 'view',
  commission_rate REAL DEFAULT 0.0,
  can_impersonate BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(partner_id, client_id)
);

-- Create Analytics Events table
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  bot_id TEXT REFERENCES bots(id),
  user_id TEXT,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  session_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create Bot Templates table
CREATE TABLE IF NOT EXISTS bot_templates (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  industry VARCHAR(100),
  system_prompt TEXT,
  configuration JSONB,
  is_public BOOLEAN DEFAULT FALSE,
  is_premium BOOLEAN DEFAULT FALSE,
  price_cents INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  install_count INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- ALTER EXISTING TABLES
-- ============================================

-- Add multi-tenant columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Add multi-tenant columns to bots
ALTER TABLE bots ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id);
ALTER TABLE bots ADD COLUMN IF NOT EXISTS analytics JSONB DEFAULT '{}';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Add multi-tenant columns to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id);

-- Add multi-tenant columns to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id);

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- Organization indexes
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug) WHERE deleted_at IS NULL;

-- Organization members indexes
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_action ON audit_logs(organization_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Partner clients indexes
CREATE INDEX IF NOT EXISTS idx_partner_clients_partner ON partner_clients(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_clients_client ON partner_clients(client_id);

-- Analytics events indexes
CREATE INDEX IF NOT EXISTS idx_analytics_events_org ON analytics_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_bot ON analytics_events(bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type, created_at DESC);

-- Bot templates indexes
CREATE INDEX IF NOT EXISTS idx_bot_templates_public ON bot_templates(is_public, rating DESC) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_bot_templates_category ON bot_templates(category);
CREATE INDEX IF NOT EXISTS idx_bot_templates_industry ON bot_templates(industry);

-- Update existing table indexes
CREATE INDEX IF NOT EXISTS idx_bots_organization ON bots(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_organization ON leads(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_organization ON conversations(organization_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_bot ON conversations(bot_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- ============================================
-- CREATE SYSTEM ROLES
-- ============================================

-- Insert default system roles (these will be created programmatically during migration)
-- ADMIN, PARTNER, CLIENT, MEMBER

