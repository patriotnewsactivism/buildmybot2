/**
 * Unified dashboard navigation config.
 *
 * Single source of truth for every role's sidebar. Replaces the two competing
 * systems that existed before (the hardcoded list in Layout/Sidebar.tsx and the
 * flat href list in dashboardNav.ts). Items are grouped into labelled sections
 * so it's clear where to go for what, and every `to` is a real router path that
 * resolves to a rendered route in App.tsx.
 */

import {
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  CreditCard,
  FileText,
  Globe,
  Handshake,
  Headphones,
  LayoutDashboard,
  Link2,
  Megaphone,
  MessageSquare,
  Phone,
  Server,
  Settings,
  ShoppingBag,
  Sparkles,
  UserCog,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { UserRole } from '../../types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** true for a section's index route so it only matches exactly. */
  end?: boolean;
}

export interface NavGroup {
  heading?: string;
  items: NavItem[];
}

export type NavRole = 'admin' | 'partner' | 'agent' | 'affiliate' | 'client';

/** Map the fine-grained UserRole enum onto the five nav layouts. */
export function getNavRole(role: UserRole): NavRole {
  if (
    role === UserRole.MASTER_ADMIN ||
    role === UserRole.ADMIN ||
    role === UserRole.ADMIN_LEGACY
  ) {
    return 'admin';
  }
  if (role === UserRole.PARTNER || role === UserRole.RESELLER) return 'partner';
  if (role === UserRole.SALES_AGENT) return 'agent';
  if (role === UserRole.AFFILIATE) return 'affiliate';
  return 'client';
}

/** The landing route for each role after login. */
export const ROLE_HOME: Record<NavRole, string> = {
  admin: '/admin',
  partner: '/partner',
  agent: '/agent',
  affiliate: '/affiliate',
  client: '/app',
};

export const NAV: Record<NavRole, NavGroup[]> = {
  // ─── Master Admin ───
  admin: [
    {
      heading: 'Overview',
      items: [
        { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
        { label: 'Analytics', to: '/admin/analytics', icon: BarChart3 },
        { label: 'Financial', to: '/admin/financial', icon: Wallet },
      ],
    },
    {
      heading: 'People',
      items: [
        { label: 'Users', to: '/admin/users', icon: Users },
        { label: 'Partners', to: '/admin/partners', icon: Handshake },
        { label: 'Sales Agents', to: '/admin/agents', icon: Briefcase },
        { label: 'Clients', to: '/admin/clients', icon: Building2 },
        { label: 'Affiliates', to: '/admin/affiliates', icon: Link2 },
      ],
    },
    {
      heading: 'Operations',
      items: [
        { label: 'All Bots', to: '/admin/bots', icon: Bot },
        { label: 'Voice Receptionist', to: '/admin/voice', icon: Phone },
        {
          label: 'Conversations',
          to: '/admin/conversations',
          icon: MessageSquare,
        },
        { label: 'AI Team', to: '/admin/ai-team', icon: Sparkles },
        { label: 'Support', to: '/admin/support', icon: Headphones },
        { label: 'System', to: '/admin/system', icon: Server },
      ],
    },
  ],

  // ─── Partner / Reseller ───
  partner: [
    {
      items: [
        {
          label: 'Dashboard',
          to: '/partner',
          icon: LayoutDashboard,
          end: true,
        },
        { label: 'My Sales Agents', to: '/partner/agents', icon: Briefcase },
        { label: 'Clients', to: '/partner/clients', icon: Building2 },
        {
          label: 'Conversations',
          to: '/partner/conversations',
          icon: MessageSquare,
        },
      ],
    },
    {
      heading: 'Business',
      items: [
        { label: 'Earnings', to: '/partner/commissions', icon: Wallet },
        { label: 'Marketing', to: '/partner/marketing', icon: Megaphone },
        { label: 'Analytics', to: '/partner/analytics', icon: BarChart3 },
        { label: 'Collaboration', to: '/partner/collaboration', icon: Users },
      ],
    },
  ],

  // ─── Sales Agent ───
  // AgentDashboard is a single self-contained page; one entry avoids dead links.
  agent: [
    {
      items: [
        { label: 'Dashboard', to: '/agent', icon: LayoutDashboard, end: true },
        { label: 'Settings', to: '/agent/settings', icon: Settings },
      ],
    },
  ],

  // ─── Affiliate ───
  // AffiliateDashboard is a single self-contained page; one entry avoids dead links.
  affiliate: [
    {
      items: [
        {
          label: 'Dashboard',
          to: '/affiliate',
          icon: LayoutDashboard,
          end: true,
        },
        { label: 'Settings', to: '/affiliate/settings', icon: Settings },
      ],
    },
  ],

  // ─── Client / Owner ───
  client: [
    {
      heading: 'Workspace',
      items: [
        { label: 'Dashboard', to: '/app', icon: LayoutDashboard, end: true },
        { label: 'My Bots', to: '/app/bots', icon: Bot },
        { label: 'Voice Receptionist', to: '/app/phone', icon: Phone },
        {
          label: 'Conversations',
          to: '/app/conversations',
          icon: MessageSquare,
        },
        { label: 'Lead CRM', to: '/app/leads', icon: Users },
      ],
    },
    {
      heading: 'Growth',
      items: [
        { label: 'Analytics', to: '/app/analytics', icon: BarChart3 },
        { label: 'Landing Pages', to: '/app/landing-pages', icon: FileText },
        { label: 'AI Marketing', to: '/app/marketing', icon: Megaphone },
        { label: 'AI Sites', to: '/app/website', icon: Globe },
      ],
    },
    {
      heading: 'Resources',
      items: [
        { label: 'Marketplace', to: '/app/marketplace', icon: ShoppingBag },
        { label: 'Pro Services', to: '/app/services', icon: Zap },
        { label: 'AI Team', to: '/app/ai-team', icon: Sparkles },
      ],
    },
    {
      heading: 'Account',
      items: [
        { label: 'Billing & Usage', to: '/app/billing', icon: CreditCard },
        { label: 'Support', to: '/app/support', icon: Headphones },
        { label: 'Settings', to: '/app/settings', icon: Settings },
      ],
    },
  ],
};

/** Icon used for the per-role settings shortcut in the top bar. */
export const SETTINGS_ICON: LucideIcon = UserCog;
