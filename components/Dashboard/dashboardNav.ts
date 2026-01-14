/**
 * Dashboard Navigation Configuration
 * Defines navigation structure for each role
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
  | 'client'
  | 'owner';

export const DASHBOARD_NAV: Record<DashboardRole, NavItem[]> = {
  admin: [
    { id: 'overview', label: 'Overview', href: '/admin' },
    { id: 'users', label: 'Users', href: '/admin/users' },
    { id: 'partners', label: 'Partners', href: '/admin/partners' },
    { id: 'financial', label: 'Financial', href: '/admin/financial' },
    { id: 'bots', label: 'All Bots', href: '/admin/bots' },
    { id: 'analytics', label: 'Analytics', href: '/admin/analytics' },
    { id: 'support', label: 'Support', href: '/admin/support' },
    { id: 'system', label: 'System', href: '/admin/system' },
  ],
  partner: [
    { id: 'clients', label: 'Clients', href: '/partner/clients' },
    { id: 'commissions', label: 'Earnings', href: '/partner/commissions' },
    { id: 'marketing', label: 'Marketing', href: '/partner/marketing' },
    { id: 'analytics', label: 'Analytics', href: '/partner/analytics' },
    {
      id: 'collaboration',
      label: 'Collaboration',
      href: '/partner/collaboration',
    },
  ],
  reseller: [
    { id: 'clients', label: 'Clients', href: '/partner/clients' },
    { id: 'commissions', label: 'Earnings', href: '/partner/commissions' },
    { id: 'marketing', label: 'Marketing', href: '/partner/marketing' },
    { id: 'analytics', label: 'Analytics', href: '/partner/analytics' },
    {
      id: 'collaboration',
      label: 'Collaboration',
      href: '/partner/collaboration',
    },
  ],
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
};
