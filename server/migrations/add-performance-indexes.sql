-- ========================================
-- Performance Optimization Indexes
-- Phase 4.1: Add Database Indexes
-- ========================================

-- USERS Table Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_reseller_code ON users(reseller_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- BOTS Table Indexes
CREATE INDEX IF NOT EXISTS idx_bots_organization_id ON bots(organization_id);
CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id);
CREATE INDEX IF NOT EXISTS idx_bots_active ON bots(active);
CREATE INDEX IF NOT EXISTS idx_bots_type ON bots(type);
CREATE INDEX IF NOT EXISTS idx_bots_created_at ON bots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bots_deleted_at ON bots(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bots_org_active ON bots(organization_id, active);

-- LEADS Table Indexes
CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_source_bot_id ON leads(source_bot_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON leads(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_bot_created ON leads(source_bot_id, created_at DESC);

-- CONVERSATIONS Table Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_organization_id ON conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_bot_id ON conversations(bot_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_sentiment ON conversations(sentiment);
CREATE INDEX IF NOT EXISTS idx_conversations_bot_timestamp ON conversations(bot_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_org_timestamp ON conversations(organization_id, timestamp DESC);

-- ORGANIZATIONS Table Indexes
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_plan ON organizations(plan);
CREATE INDEX IF NOT EXISTS idx_organizations_subscription_status ON organizations(subscription_status);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON organizations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_organizations_deleted_at ON organizations(deleted_at) WHERE deleted_at IS NULL;

-- ORGANIZATION_MEMBERS Table Indexes
CREATE INDEX IF NOT EXISTS idx_org_members_organization_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(role);
CREATE INDEX IF NOT EXISTS idx_org_members_joined_at ON organization_members(joined_at DESC);

-- AUDIT_LOGS Table Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC);

-- PARTNER_CLIENTS Table Indexes
CREATE INDEX IF NOT EXISTS idx_partner_clients_partner_id ON partner_clients(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_clients_client_id ON partner_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_partner_clients_organization_id ON partner_clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_partner_clients_created_at ON partner_clients(created_at DESC);

-- ANALYTICS_EVENTS Table Indexes
CREATE INDEX IF NOT EXISTS idx_analytics_organization_id ON analytics_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_analytics_bot_id ON analytics_events(bot_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_session_id ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_org_created ON analytics_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_bot_created ON analytics_events(bot_id, created_at DESC);

-- IMPERSONATION_SESSIONS Table Indexes
CREATE INDEX IF NOT EXISTS idx_impersonation_actor_user_id ON impersonation_sessions(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_target_user_id ON impersonation_sessions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_expires_at ON impersonation_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_impersonation_created_at ON impersonation_sessions(created_at DESC);

-- BOT_TEMPLATES Table Indexes
CREATE INDEX IF NOT EXISTS idx_bot_templates_category ON bot_templates(category);
CREATE INDEX IF NOT EXISTS idx_bot_templates_industry ON bot_templates(industry);
CREATE INDEX IF NOT EXISTS idx_bot_templates_is_public ON bot_templates(is_public);
CREATE INDEX IF NOT EXISTS idx_bot_templates_is_premium ON bot_templates(is_premium);
CREATE INDEX IF NOT EXISTS idx_bot_templates_rating ON bot_templates(rating DESC);
CREATE INDEX IF NOT EXISTS idx_bot_templates_install_count ON bot_templates(install_count DESC);
CREATE INDEX IF NOT EXISTS idx_bot_templates_created_by ON bot_templates(created_by);

-- BOT_DOCUMENTS Table Indexes
CREATE INDEX IF NOT EXISTS idx_bot_documents_bot_id ON bot_documents(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_documents_file_type ON bot_documents(file_type);
CREATE INDEX IF NOT EXISTS idx_bot_documents_created_at ON bot_documents(created_at DESC);

-- PARTNER_PAYOUTS Table Indexes
CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner_id ON partner_payouts(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_status ON partner_payouts(status);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_period_start ON partner_payouts(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_period_end ON partner_payouts(period_end DESC);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_created_at ON partner_payouts(created_at DESC);

-- SUPPORT_TICKETS Table Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_organization_id ON support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_updated_at ON support_tickets(updated_at DESC);

-- Composite Indexes for Common Query Patterns
-- These cover multiple columns that are frequently queried together

-- User lookups by organization and role
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(organization_id, role) WHERE deleted_at IS NULL;

-- Bot queries by organization and status
CREATE INDEX IF NOT EXISTS idx_bots_org_active_created ON bots(organization_id, active, created_at DESC) WHERE deleted_at IS NULL;

-- Lead queries by organization and status
CREATE INDEX IF NOT EXISTS idx_leads_org_status_created ON leads(organization_id, status, created_at DESC);

-- Conversation analytics by org and date range
CREATE INDEX IF NOT EXISTS idx_conversations_org_bot_timestamp ON conversations(organization_id, bot_id, timestamp DESC);

-- Partner dashboard queries
CREATE INDEX IF NOT EXISTS idx_partner_clients_partner_org ON partner_clients(partner_id, organization_id);

-- Admin dashboard queries
CREATE INDEX IF NOT EXISTS idx_users_plan_status_created ON users(plan, status, created_at DESC) WHERE deleted_at IS NULL;

-- Analytics time-series queries
CREATE INDEX IF NOT EXISTS idx_analytics_org_type_created ON analytics_events(organization_id, event_type, created_at DESC);

COMMENT ON INDEX idx_users_email IS 'Fast lookups for user authentication';
COMMENT ON INDEX idx_users_organization_id IS 'User queries filtered by organization';
COMMENT ON INDEX idx_bots_org_active ON 'Active bots per organization';
COMMENT ON INDEX idx_leads_bot_created IS 'Lead performance tracking per bot';
COMMENT ON INDEX idx_conversations_bot_timestamp IS 'Conversation history for analytics';
COMMENT ON INDEX idx_audit_logs_org_created IS 'Audit log queries with date filtering';
COMMENT ON INDEX idx_analytics_org_created IS 'Time-series analytics queries';
