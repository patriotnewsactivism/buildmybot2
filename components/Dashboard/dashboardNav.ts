/**
 * Dashboard Navigation Configuration
 * Defines navigation structure for each role in the 4-tier hierarchy:
 *   Master Admin → Partner → Sales Agent → Client
 * Plus Affiliate (lightweight referral-only role)
 */

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: string;
  permissions?: string[];
}

export type DashboardRole =
  | 'admin'
  | 'partner'
  | 'reseller'
  | 'sales_agent'
  | 'client'
  | 'owner'
  | 'affiliate';

export const DASHBOARD_NAV: Record<DashboardRole, NavItem[]> = {
  // ─── Tier 4: Master Admin (don@donmatthews.live) ───
  admin: [
    { id: 'overview', label: 'Overview', href: '/admin' },
    { id: 'users', label: 'Users', href: '/admin/users' },
    { id: 'partners', label: 'Partners', href: '/admin/partners' },
    { id: 'agents', label: 'Sales Agents', href: '/admin/agents' },
    { id: 'clients', label: 'All Clients', href: '/admin/clients' },
    { id: 'conversations', label: 'Conversations', href: '/admin/conversations' },
    { id: 'financial', label: 'Financial', href: '/admin/financial' },
    { id: 'bots', label: 'All Bots', href: '/admin/bots' },
    { id: 'analytics', label: 'Analytics', href: '/admin/analytics' },
    { id: 'affiliates', label: 'Affiliates', href: '/admin/affiliates' },
    { id: 'support', label: 'Support', href: '/admin/support' },
    { id: 'system', label: 'System', href: '/admin/system' },
  ],

  // ─── Tier 3: Partner (manages sales agents) ───
  partner: [
    { id: 'overview', label: 'Dashboard', href: '/partner' },
    { id: 'agents', label: 'My Sales Agents', href: '/partner/agents' },
    { id: 'clients', label: 'All Clients', href: '/partner/clients' },
    { id: 'conversations', label: 'Conversations', href: '/partner/conversations' },
    { id: 'commissions', label: 'Earnings', href: '/partner/commissions' },
    { id: 'marketing', label: 'Marketing', href: '/partner/marketing' },
    { id: 'analytics', label: 'Analytics', href: '/partner/analytics' },
    {
      id: 'collaboration',
      label: 'Collaboration',
      href: '/partner/collaboration',
    },
  ],

  // Legacy reseller role (mapped to partner nav)
  reseller: [
    { id: 'overview', label: 'Dashboard', href: '/partner' },
    { id: 'agents', label: 'My Sales Agents', href: '/partner/agents' },
    { id: 'clients', label: 'All Clients', href: '/partner/clients' },
    { id: 'conversations', label: 'Conversations', href: '/partner/conversations' },
    { id: 'commissions', label: 'Earnings', href: '/partner/commissions' },
    { id: 'marketing', label: 'Marketing', href: '/partner/marketing' },
    { id: 'analytics', label: 'Analytics', href: '/partner/analytics' },
    {
      id: 'collaboration',
      label: 'Collaboration',
      href: '/partner/collaboration',
    },
  ],

  // ─── Tier 2: Sales Agent (sells to clients, reports to partner) ───
  sales_agent: [
    { id: 'overview', label: 'Dashboard', href: '/agent' },
    { id: 'clients', label: 'My Clients', href: '/agent/clients' },
    { id: 'conversations', label: 'Conversations', href: '/agent/conversations' },
    { id: 'leads', label: 'Prospects', href: '/agent/leads' },
    { id: 'commissions', label: 'Earnings', href: '/agent/commissions' },
    { id: 'marketing', label: 'Marketing', href: '/agent/marketing' },
  ],

  // ─── Tier 1: Client (end business using the chatbot) ───
  client: [
    { id: 'home', label: 'Dashboard', href: '/app' },
    { id: 'bots', label: 'My Bots', href: '/app/bots' },
    { id: 'conversations', label: 'Conversations', href: '/app/conversations' },
    { id: 'leads', label: 'Lead CRM', href: '/app/leads' },
    { id: 'phone', label: 'Phone Agent', href: '/app/phone' },
    { id: 'analytics', label: 'Analytics', href: '/app/analytics' },
    { id: 'landing-pages', label: 'Landing Pages', href: '/app/landing-pages' },
    { id: 'marketing', label: 'AI Marketing', href: '/app/marketing' },
    { id: 'marketplace', label: 'Marketplace', href: '/app/marketplace' },
    { id: 'billing', label: 'Billing & Usage', href: '/app/billing' },
    { id: 'support', label: 'Support', href: '/app/support' },
    { id: 'settings', label: 'Settings', href: '/app/settings' },
  ],

  // Owner (same as client for now)
  owner: [
    { id: 'home', label: 'Dashboard', href: '/app' },
    { id: 'bots', label: 'My Bots', href: '/app/bots' },
    { id: 'conversations', label: 'Conversations', href: '/app/conversations' },
    { id: 'leads', label: 'Lead CRM', href: '/app/leads' },
    { id: 'phone', label: 'Phone Agent', href: '/app/phone' },
    { id: 'analytics', label: 'Analytics', href: '/app/analytics' },
    { id: 'landing-pages', label: 'Landing Pages', href: '/app/landing-pages' },
    { id: 'marketing', label: 'AI Marketing', href: '/app/marketing' },
    { id: 'marketplace', label: 'Marketplace', href: '/app/marketplace' },
    { id: 'billing', label: 'Billing & Usage', href: '/app/billing' },
    { id: 'support', label: 'Support', href: '/app/support' },
    { id: 'settings', label: 'Settings', href: '/app/settings' },
  ],

  // ─── Affiliate (referral-only, no client management) ───
  affiliate: [
    { id: 'overview', label: 'Dashboard', href: '/affiliate' },
    { id: 'referrals', label: 'My Referrals', href: '/affiliate/referrals' },
    { id: 'earnings', label: 'Earnings', href: '/affiliate/earnings' },
    { id: 'links', label: 'Referral Links', href: '/affiliate/links' },
    { id: 'marketing', label: 'Marketing Kit', href: '/affiliate/marketing' },
  ],
};
