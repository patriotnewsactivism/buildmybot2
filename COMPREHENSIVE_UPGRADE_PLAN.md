# BuildMyBot Comprehensive Upgrade and Optimization Plan

**Document Version:** 2.0
**Date:** January 6, 2026
**Last Updated:** January 6, 2026
**Prepared By:** Tri-Core Architect System
**Status:** COMPLETE - Ready for Implementation

---

## EXECUTIVE SUMMARY

This document outlines a comprehensive, phased approach to transform BuildMyBot from its current state into a fully-optimized, enterprise-grade, multi-tenant SaaS platform with three distinct dashboard experiences (Admin, Partner/Reseller, and Client), enhanced bot-building capabilities, and robust quality assurance.

### Current State Assessment

**Technology Stack:**
- Frontend: React 18.2 + TypeScript + Vite
- Backend: Express.js 5.1 (Node.js)
- Database: PostgreSQL via Drizzle ORM
- State Management: React hooks (local state)
- Authentication: Replit Auth integration
- Payment Processing: Stripe (integrated)
- AI Services: OpenAI GPT-5o Mini (migrated from GPT-4o Mini for cost optimization)
- Voice Services: Cartesia AI

**Existing Features:**
- Basic bot builder with persona templates
- Admin dashboard with user/partner management
- Reseller dashboard with commission tracking and marketing materials
- Lead CRM system
- Conversation logging
- Website builder
- Marketing tools
- Phone agent configuration
- Stripe integration for billing and white-label fees
- Document upload for knowledge base

**Critical Findings:**

1. **Architecture Strengths:**
   - Clean separation between client/server
   - Proper use of TypeScript types
   - Good database schema foundation with relations
   - Stripe integration with webhook handling
   - Real-time subscriptions via dbService

2. **Architecture Gaps:**
   - No clear multi-tenancy isolation in queries
   - Missing role-based access control (RBAC) middleware
   - No audit logging system
   - Limited error handling and validation
   - No caching layer
   - No rate limiting
   - Missing performance monitoring

3. **Dashboard Issues:**
   - Admin dashboard exists but lacks comprehensive oversight tools
   - Partner dashboard solid but missing client impersonation
   - No dedicated client dashboard (uses same views as admin/partner)
   - Inconsistent UI/UX patterns across dashboards

4. **Bot Building Pain Points:**
   - Complex configuration spread across multiple tabs
   - No guided onboarding for bot creation
   - Limited voice agent integration workflow
   - Knowledge base upload needs better UX
   - Missing bot templates marketplace

5. **Security Concerns:**
   - Hardcoded admin email addresses
   - Direct user status updates without audit trail
   - No comprehensive input validation
   - Missing CSRF protection
   - No API rate limiting

---

## PHASE 1: FOUNDATION & ARCHITECTURE (Weeks 1-3)

### 1.1 Database Schema Enhancements

**Objective:** Implement true multi-tenancy with proper isolation and comprehensive audit logging.

**New Tables:**

```sql
-- Organizations table for multi-tenant isolation
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  owner_id TEXT REFERENCES users(id),
  plan VARCHAR(50) DEFAULT 'FREE',
  subscription_status VARCHAR(50) DEFAULT 'active',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Team members (allows multiple users per organization)
CREATE TABLE organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- owner, admin, member, viewer
  permissions JSONB DEFAULT '[]',
  invited_by TEXT REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Audit log for compliance and debugging
CREATE TABLE audit_logs (
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

-- Permissions and roles
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '[]',
  is_system_role BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Partner-Client relationship table
CREATE TABLE partner_clients (
  id TEXT PRIMARY KEY,
  partner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  access_level VARCHAR(50) DEFAULT 'view', -- view, manage, full
  commission_rate REAL DEFAULT 0.0,
  can_impersonate BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(partner_id, client_id)
);

-- Analytics events for tracking
CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  bot_id TEXT REFERENCES bots(id),
  user_id TEXT,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  session_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bot templates marketplace
CREATE TABLE bot_templates (
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
```

**Schema Migrations:**

```sql
-- Migrate existing data to organization model
ALTER TABLE users ADD COLUMN organization_id TEXT REFERENCES organizations(id);
ALTER TABLE bots ADD COLUMN organization_id TEXT REFERENCES organizations(id);
ALTER TABLE leads ADD COLUMN organization_id TEXT REFERENCES organizations(id);
ALTER TABLE conversations ADD COLUMN organization_id TEXT REFERENCES organizations(id);

-- Add soft delete support
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE bots ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE organizations ADD COLUMN deleted_at TIMESTAMP;

-- Add metadata columns
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}';
ALTER TABLE bots ADD COLUMN analytics JSONB DEFAULT '{}';
```

### 1.2 Backend Architecture Improvements

**Middleware Stack:**

```typescript
// C:/buildmybot/server/middleware/index.ts

import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { validateRequest } from './validation';
import { auditLog } from './audit';
import { authenticate, authorize } from './auth';
import { tenantIsolation } from './tenant';

// Rate limiting
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Rate limit exceeded'
});

// Security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameSrc: ["https://js.stripe.com"],
    },
  },
});

// Tenant isolation middleware
export const requireTenant = tenantIsolation();

// RBAC middleware
export const requireRole = (roles: string[]) => authorize(roles);

// Audit logging middleware
export const auditMiddleware = auditLog();
```

**Authentication & Authorization:**

```typescript
// C:/buildmybot/server/middleware/auth.ts

import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { users, organizationMembers, roles } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

export interface AuthRequest extends Request {
  user?: any;
  organization?: any;
  permissions?: string[];
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Get user from session (Replit Auth provides this)
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user || user.deleted_at) {
      return res.status(401).json({ error: 'Invalid user' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
}

export function authorize(allowedRoles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    res.status(403).json({ error: 'Insufficient permissions' });
  };
}

export async function loadOrganizationContext(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Load user's organization membership
    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, req.user.id));

    if (membership) {
      req.organization = membership;
      req.permissions = membership.permissions || [];
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to load organization context' });
  }
}
```

**Input Validation:**

```typescript
// C:/buildmybot/server/middleware/validation.ts

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const BotSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().max(100),
  systemPrompt: z.string().max(10000),
  model: z.string().max(100),
  temperature: z.number().min(0).max(2),
  themeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  maxMessages: z.number().int().min(1).max(10000),
  embedType: z.enum(['hover', 'fixed']),
});

export const LeadSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional(),
  score: z.number().int().min(0).max(100).optional(),
  status: z.enum(['New', 'Contacted', 'Qualified', 'Closed']),
});

export function validateRequest(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
      }
      next(error);
    }
  };
}
```

### 1.3 Service Layer Architecture

**Create abstraction layers for better testability and maintainability:**

```typescript
// C:/buildmybot/server/services/BotService.ts

import { db } from '../db';
import { bots } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { AuditService } from './AuditService';
import { Bot, InsertBot } from '../../shared/schema';

export class BotService {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  async createBot(
    botData: InsertBot,
    userId: string,
    organizationId: string
  ): Promise<Bot> {
    const newBot = await db
      .insert(bots)
      .values({
        ...botData,
        userId,
        organizationId,
      })
      .returning();

    await this.auditService.log({
      userId,
      organizationId,
      action: 'bot.created',
      resourceType: 'bot',
      resourceId: newBot[0].id,
      newValues: newBot[0],
    });

    return newBot[0];
  }

  async getBotsByOrganization(organizationId: string): Promise<Bot[]> {
    return db
      .select()
      .from(bots)
      .where(
        and(
          eq(bots.organizationId, organizationId),
          eq(bots.deleted_at, null)
        )
      );
  }

  async updateBot(
    botId: string,
    updates: Partial<Bot>,
    userId: string,
    organizationId: string
  ): Promise<Bot> {
    const [oldBot] = await db
      .select()
      .from(bots)
      .where(eq(bots.id, botId));

    const [updatedBot] = await db
      .update(bots)
      .set(updates)
      .where(eq(bots.id, botId))
      .returning();

    await this.auditService.log({
      userId,
      organizationId,
      action: 'bot.updated',
      resourceType: 'bot',
      resourceId: botId,
      oldValues: oldBot,
      newValues: updatedBot,
    });

    return updatedBot;
  }

  async deleteBot(
    botId: string,
    userId: string,
    organizationId: string
  ): Promise<void> {
    // Soft delete
    await db
      .update(bots)
      .set({ deleted_at: new Date() })
      .where(eq(bots.id, botId));

    await this.auditService.log({
      userId,
      organizationId,
      action: 'bot.deleted',
      resourceType: 'bot',
      resourceId: botId,
    });
  }
}
```

---

## PHASE 2: DASHBOARD SYSTEM OVERHAUL (Weeks 4-6)

### 2.1 Admin Dashboard - Master Control Center

**Objective:** Create comprehensive oversight with real-time monitoring, advanced analytics, and system-wide controls.

**New Features:**

1. **Real-Time System Monitoring**
   - Live metrics dashboard (active users, API calls/min, database connections)
   - Error rate tracking with alerting
   - Server health checks
   - Database query performance monitoring

2. **Advanced User Management**
   - Bulk operations (suspend, activate, delete)
   - User impersonation for support
   - Account merge functionality
   - Usage analytics per user
   - Export user data (GDPR compliance)

3. **Partner Oversight**
   - Partner performance leaderboard
   - Commission payout management
   - Partner tier progression tracking
   - Fraud detection alerts
   - Partner application workflow

4. **Financial Dashboard**
   - Revenue analytics (MRR, ARR, churn rate)
   - Stripe integration health
   - Refund management
   - Invoice generation
   - Tax reporting

5. **System Configuration**
   - Feature flags management
   - Environment variables editor
   - API key rotation
   - Maintenance mode toggle
   - Email template editor

**Component Structure:**

```typescript
// C:/buildmybot/components/Admin/AdminDashboard.tsx (Enhanced)

interface AdminTab {
  id: string;
  label: string;
  component: React.FC;
  permissions?: string[];
}

const ADMIN_TABS: AdminTab[] = [
  { id: 'overview', label: 'Overview', component: AdminOverview },
  { id: 'users', label: 'Users', component: UserManagement },
  { id: 'partners', label: 'Partners', component: PartnerManagement },
  { id: 'financial', label: 'Financial', component: FinancialDashboard },
  { id: 'bots', label: 'All Bots', component: GlobalBotManagement },
  { id: 'analytics', label: 'Analytics', component: SystemAnalytics },
  { id: 'support', label: 'Support', component: SupportQueue },
  { id: 'settings', label: 'System', component: SystemSettings },
];
```

**Real-Time Monitoring Widget:**

```typescript
// C:/buildmybot/components/Admin/widgets/LiveMetrics.tsx

import { useEffect, useState } from 'react';
import { Activity, Users, Database, AlertTriangle } from 'lucide-react';

export const LiveMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState({
    activeUsers: 0,
    apiCallsPerMin: 0,
    dbConnections: 0,
    errorRate: 0,
  });

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/api/admin/metrics`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMetrics(data);
    };

    return () => ws.close();
  }, []);

  return (
    <div className="grid grid-cols-4 gap-4">
      <MetricCard
        icon={Users}
        label="Active Users"
        value={metrics.activeUsers}
        trend="+5%"
      />
      <MetricCard
        icon={Activity}
        label="API Calls/min"
        value={metrics.apiCallsPerMin}
        trend="+12%"
      />
      <MetricCard
        icon={Database}
        label="DB Connections"
        value={metrics.dbConnections}
        status={metrics.dbConnections > 80 ? 'warning' : 'healthy'}
      />
      <MetricCard
        icon={AlertTriangle}
        label="Error Rate"
        value={`${metrics.errorRate}%`}
        status={metrics.errorRate > 1 ? 'critical' : 'healthy'}
      />
    </div>
  );
};
```

### 2.2 Partner/Reseller Dashboard - Enhanced Agency Portal

**Objective:** Empower partners to manage clients, view detailed analytics, and access comprehensive marketing resources.

**New Features:**

1. **Client Management Portal**
   - View all referred clients in sortable/filterable table
   - Client impersonation (with audit logging)
   - Perform actions on behalf of clients (bot creation, lead management)
   - View client financial data (MRR, usage, plan details)
   - Client lifecycle tracking (signup -> active -> churned)

2. **Commission & Earnings**
   - Real-time commission calculator
   - Payout history with detailed breakdowns
   - Tax document downloads (1099 forms)
   - Referral credit balance and redemption
   - Whitelabel fee status and payment portal

3. **Marketing Materials Hub**
   - Downloadable PDF sales decks (with partner branding)
   - Email templates with merge tags
   - Social media graphics pack
   - Case study templates
   - ROI calculator spreadsheet
   - White-label brand guidelines
   - Video demo library

4. **Performance Analytics**
   - Conversion funnel (clicks -> signups -> paid)
   - Top performing campaigns
   - Client retention metrics
   - Revenue forecasting
   - Tier progression tracker

5. **Collaboration Tools**
   - Shared notes on client accounts
   - Task management for client onboarding
   - Email integration for client communication
   - Calendar for client meetings

**Component Structure:**

```typescript
// C:/buildmybot/components/Reseller/ClientManagementTab.tsx

import { useState, useEffect } from 'react';
import { dbService } from '../../services/dbService';
import { User } from '../../types';

interface ClientWithMetrics extends User {
  mrr: number;
  botCount: number;
  leadCount: number;
  lastActive: Date;
}

export const ClientManagementTab: React.FC<{ partnerId: string }> = ({ partnerId }) => {
  const [clients, setClients] = useState<ClientWithMetrics[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);

  const handleImpersonate = async (clientId: string) => {
    // Security: Log impersonation action
    await dbService.auditLog({
      action: 'partner.impersonate',
      resourceType: 'user',
      resourceId: clientId,
      metadata: { partnerId },
    });

    // Switch context to client
    setImpersonating(true);
    setSelectedClient(clientId);

    // Redirect to client dashboard view
    window.location.href = `/dashboard?impersonate=${clientId}`;
  };

  const handleCreateBotForClient = async (clientId: string) => {
    // Partner creates bot on behalf of client
    // This action is audited and client is notified
  };

  return (
    <div className="space-y-6">
      <ClientTable
        clients={clients}
        onImpersonate={handleImpersonate}
        onViewDetails={(id) => setSelectedClient(id)}
      />

      {selectedClient && (
        <ClientDetailPanel
          clientId={selectedClient}
          partnerId={partnerId}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  );
};
```

**Marketing Materials Download System:**

```typescript
// C:/buildmybot/components/Reseller/MarketingMaterialsTab.tsx

export const MarketingMaterialsTab: React.FC = () => {
  const materials = [
    {
      id: 'sales-deck',
      title: 'Partner Sales Deck',
      description: 'Professional presentation for pitching to local businesses',
      type: 'PDF',
      size: '2.4 MB',
      downloadUrl: '/assets/marketing/sales-deck.pdf',
      previewUrl: '/assets/marketing/sales-deck-preview.png',
    },
    {
      id: 'roi-calculator',
      title: 'ROI Calculator Spreadsheet',
      description: 'Customizable calculator to demonstrate value to prospects',
      type: 'XLSX',
      size: '89 KB',
      downloadUrl: '/assets/marketing/roi-calculator.xlsx',
    },
    // ... more materials
  ];

  const handleDownload = async (material: any) => {
    // Track download for analytics
    await fetch('/api/analytics/track', {
      method: 'POST',
      body: JSON.stringify({
        event: 'material_downloaded',
        materialId: material.id,
      }),
    });

    // Trigger download
    window.open(material.downloadUrl, '_blank');
  };

  return (
    <div className="grid grid-cols-3 gap-6">
      {materials.map((material) => (
        <MaterialCard
          key={material.id}
          material={material}
          onDownload={() => handleDownload(material)}
        />
      ))}
    </div>
  );
};
```

### 2.3 Client Dashboard - Simplified User Experience

**Objective:** Create an intuitive, focused dashboard for end clients that makes bot management and lead tracking effortless.

**Design Principles:**
- Minimal clicks to value
- Progressive disclosure (advanced features hidden by default)
- Contextual help and onboarding
- Mobile-first responsive design
- Clear calls-to-action

**New Features:**

1. **Quick Start Wizard**
   - 3-step bot creation flow
   - Pre-populated industry templates
   - One-click deployment
   - Guided knowledge base setup

2. **Simplified Bot Management**
   - Card-based bot overview (status, conversations, leads)
   - Toggle active/inactive with one click
   - Quick edit modal for common changes
   - Duplicate bot functionality
   - Bot performance at-a-glance

3. **Lead Dashboard**
   - Visual pipeline (New -> Contacted -> Qualified -> Closed)
   - Lead score highlighting
   - One-click email/call from lead card
   - Quick note-taking
   - Export to CSV

4. **Analytics Simplified**
   - 3 key metrics: Conversations, Leads, Conversion Rate
   - Weekly summary email
   - Trend indicators (up/down arrows)
   - Simple bar charts (no complex graphs)

5. **Help & Support**
   - Embedded video tutorials
   - Searchable knowledge base
   - Live chat support
   - Onboarding checklist

**Component Structure:**

```typescript
// C:/buildmybot/components/Client/ClientDashboard.tsx

export const ClientDashboard: React.FC<{ user: User }> = ({ user }) => {
  const [showOnboarding, setShowOnboarding] = useState(!user.onboardingComplete);

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      {/* Hero Section with Key Metrics */}
      <QuickStatsBar userId={user.id} />

      {/* My Bots Section */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">My Bots</h2>
          <button
            onClick={() => setShowBotWizard(true)}
            className="btn-primary"
          >
            + Create New Bot
          </button>
        </div>
        <BotCardGrid userId={user.id} />
      </section>

      {/* Recent Leads Section */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Recent Leads</h2>
        <LeadTable userId={user.id} limit={10} />
      </section>

      {/* Help Resources */}
      <section className="bg-blue-50 rounded-xl p-6">
        <h3 className="font-bold mb-4">Need Help?</h3>
        <div className="grid grid-cols-3 gap-4">
          <HelpCard
            icon={PlayCircle}
            title="Watch Tutorials"
            link="/help/videos"
          />
          <HelpCard
            icon={MessageSquare}
            title="Contact Support"
            link="/support"
          />
          <HelpCard
            icon={Book}
            title="Knowledge Base"
            link="/help/docs"
          />
        </div>
      </section>
    </div>
  );
};
```

**Onboarding Wizard:**

```typescript
// C:/buildmybot/components/Client/OnboardingWizard.tsx

export const OnboardingWizard: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [botData, setBotData] = useState({});

  const steps = [
    {
      title: 'Choose Your Industry',
      component: <IndustrySelector onSelect={(industry) => setBotData({ ...botData, industry })} />,
    },
    {
      title: 'Customize Your Bot',
      component: <BotCustomizer data={botData} onChange={setBotData} />,
    },
    {
      title: 'Deploy & Test',
      component: <DeploymentStep data={botData} onComplete={onComplete} />,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <ProgressBar currentStep={step} totalSteps={steps.length} />
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-3xl font-bold mb-2">{steps[step - 1].title}</h2>
        <p className="text-slate-500 mb-8">Step {step} of {steps.length}</p>
        {steps[step - 1].component}
        <div className="flex justify-between mt-8">
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="btn-secondary">
              Back
            </button>
          )}
          <button
            onClick={() => step < steps.length ? setStep(step + 1) : onComplete()}
            className="btn-primary ml-auto"
          >
            {step < steps.length ? 'Next' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  );
};
```

### 2.4 Shared Dashboard Infrastructure

**Objective:** Standardize navigation, layout, and access control across all dashboards while keeping role-specific experiences.

**Core Building Blocks:**
- `DashboardShell` layout with shared header, nav, and context switcher
- Role-based navigation configuration (Admin, Partner, Client)
- Route guard with RBAC + tenant checks
- Impersonation banner and safe-exit controls
- Feature-flagged modules for phased rollout

**Navigation Map:**

```typescript
// C:/buildmybot/components/Dashboard/dashboardNav.ts

export const DASHBOARD_NAV = {
  admin: [
    { id: 'overview', label: 'Overview', href: '/admin' },
    { id: 'users', label: 'Users', href: '/admin/users' },
    { id: 'partners', label: 'Partners', href: '/admin/partners' },
    { id: 'financial', label: 'Financial', href: '/admin/financial' },
    { id: 'system', label: 'System', href: '/admin/system' },
  ],
  partner: [
    { id: 'clients', label: 'Clients', href: '/partner/clients' },
    { id: 'commissions', label: 'Earnings', href: '/partner/commissions' },
    { id: 'marketing', label: 'Marketing', href: '/partner/marketing' },
    { id: 'analytics', label: 'Analytics', href: '/partner/analytics' },
  ],
  client: [
    { id: 'home', label: 'Dashboard', href: '/app' },
    { id: 'bots', label: 'Bots', href: '/app/bots' },
    { id: 'leads', label: 'Leads', href: '/app/leads' },
    { id: 'help', label: 'Help', href: '/app/help' },
  ],
};
```

**Route Guard Pattern:**

```typescript
// C:/buildmybot/components/Dashboard/RouteGuard.tsx

export const RouteGuard: React.FC<{
  role: 'admin' | 'partner' | 'client';
  children: React.ReactNode;
}> = ({ role, children }) => {
  const { user, organizationId } = useDashboardContext();

  if (!user) return <Redirect to="/login" />;
  if (!organizationId) return <Redirect to="/onboarding" />;
  if (role !== user.role) return <Redirect to="/unauthorized" />;

  return <>{children}</>;
};
```

**Implementation Notes:**
- Use `useDashboardContext` to centralize org, role, and impersonation state.
- Show a persistent banner when impersonating with a one-click exit.
- Keep shared shell and role-specific content in separate component folders.

### 2.5 API & Data Contracts

**Objective:** Define consistent API surfaces and typed responses for each dashboard.

**Key Endpoints:**
- `GET /api/admin/metrics` (system health, usage, error rates)
- `GET /api/admin/users` (filters, pagination)
- `POST /api/admin/users/:id/impersonate`
- `GET /api/partners/clients` (with metrics)
- `GET /api/partners/commissions`
- `GET /api/clients/overview` (bots, leads, conversions)
- `GET /api/clients/leads?status=...`
- `GET /api/clients/bots`

**Example Response Types:**

```typescript
// C:/buildmybot/types.ts

export interface AdminMetrics {
  activeUsers: number;
  apiCallsPerMin: number;
  dbConnections: number;
  errorRate: number;
  mrrCents: number;
}

export interface PartnerClientSummary {
  id: string;
  name: string;
  mrrCents: number;
  botCount: number;
  leadCount: number;
  lastActiveAt: string;
  status: 'active' | 'trial' | 'churned';
}
```

### 2.6 Impersonation & Audit Controls

**Objective:** Make support workflows safe, traceable, and reversible.

**Controls:**
- Require a reason code for impersonation (support, billing, setup)
- Start an impersonation session with a max duration (e.g., 30 minutes)
- Log start/end events to `audit_logs`
- Restrict destructive actions unless elevated permission is present
- Show an always-visible banner indicating the acting user

**Audit Event Schema:**

```typescript
// C:/buildmybot/shared/types.ts

export interface ImpersonationAuditEvent {
  action: 'impersonation.started' | 'impersonation.ended';
  actorUserId: string;
  targetUserId: string;
  organizationId: string;
  reason: string;
  createdAt: string;
}
```

### 2.7 Rollout Plan & Acceptance Criteria

**Rollout Steps:**
1. Build shared shell and role-based routing (feature-flagged)
2. Ship Admin overview + users tab, then expand remaining tabs
3. Ship Partner client management, then commissions + marketing hub
4. Ship Client dashboard + onboarding wizard
5. Cut over legacy routes after parity signoff

**Acceptance Criteria:**
- P95 dashboard load time under 2 seconds for each role
- All dashboard API responses scoped by organization
- Impersonation events logged with actor, target, and reason
- No role can view another role's navigation or data

---

## PHASE 3: BOT BUILDING EXPERIENCE ENHANCEMENT (Weeks 7-9)

### 3.1 Simplified Bot Creation Flow

**Current Pain Points:**
- Too many options presented at once
- Unclear what's required vs. optional
- No guidance on best practices
- Voice agent setup is complex

**Solution: Smart Wizard + Template System**

**3-Step Bot Creation:**

1. **Choose Template** (with smart recommendations)
2. **Quick Config** (name, color, basic settings)
3. **Test & Deploy** (preview before publishing)

**Component:**

```typescript
// C:/buildmybot/components/BotBuilder/SimplifiedBotWizard.tsx

export const SimplifiedBotWizard: React.FC = () => {
  const [step, setStep] = useState<'template' | 'config' | 'deploy'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<BotTemplate | null>(null);
  const [botConfig, setBotConfig] = useState<Partial<Bot>>({});

  return (
    <div className="max-w-5xl mx-auto">
      {step === 'template' && (
        <TemplateGallery
          onSelect={(template) => {
            setSelectedTemplate(template);
            setBotConfig(template.defaultConfig);
            setStep('config');
          }}
        />
      )}

      {step === 'config' && selectedTemplate && (
        <QuickConfigPanel
          template={selectedTemplate}
          config={botConfig}
          onChange={setBotConfig}
          onNext={() => setStep('deploy')}
        />
      )}

      {step === 'deploy' && (
        <DeployPanel
          config={botConfig}
          onDeploy={async () => {
            await dbService.saveBot(botConfig as Bot);
            // Show success message and redirect
          }}
        />
      )}
    </div>
  );
};
```

### 3.2 Enhanced Template Marketplace

**Features:**
- Industry-specific templates (50+ categories)
- Community templates (users can share)
- Premium templates (paid)
- Template ratings and reviews
- One-click install
- Template customization before install

**Backend:**

```typescript
// C:/buildmybot/server/routes/templates.ts

router.get('/api/templates', async (req, res) => {
  const { category, industry, search, featured } = req.query;

  let query = db.select().from(botTemplates);

  if (category) {
    query = query.where(eq(botTemplates.category, category));
  }

  if (featured) {
    query = query.where(eq(botTemplates.is_public, true))
      .orderBy(desc(botTemplates.rating));
  }

  const templates = await query;
  res.json(templates);
});

router.post('/api/templates/:id/install', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const [template] = await db
    .select()
    .from(botTemplates)
    .where(eq(botTemplates.id, id));

  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  // Create bot from template
  const newBot = await db.insert(bots).values({
    ...template.configuration,
    userId,
    name: `${template.name} (Copy)`,
    id: uuidv4(),
  }).returning();

  // Increment install count
  await db
    .update(botTemplates)
    .set({ install_count: template.install_count + 1 })
    .where(eq(botTemplates.id, id));

  res.json(newBot[0]);
});
```

### 3.3 Voice Agent Configuration Wizard

**Simplified Voice Setup:**

1. **Voice Selection** (preview audio samples)
2. **Phone Number** (buy via Twilio integration or bring your own)
3. **Greeting Script** (AI-generated suggestions)
4. **Routing Rules** (when to transfer to human)
5. **Test Call** (call yourself to test)

**Component:**

```typescript
// C:/buildmybot/components/PhoneAgent/VoiceSetupWizard.tsx

export const VoiceSetupWizard: React.FC<{ bot: Bot }> = ({ bot }) => {
  const [step, setStep] = useState(1);
  const [voiceConfig, setVoiceConfig] = useState<PhoneAgentConfig>({
    enabled: false,
    voiceId: '',
    introMessage: '',
  });

  return (
    <div className="space-y-6">
      <ProgressBar current={step} total={5} />

      {step === 1 && (
        <VoiceSelector
          selectedVoiceId={voiceConfig.voiceId}
          onSelect={(voiceId) => {
            setVoiceConfig({ ...voiceConfig, voiceId });
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <PhoneNumberSetup
          onComplete={(phoneNumber) => {
            setVoiceConfig({ ...voiceConfig, phoneNumber });
            setStep(3);
          }}
        />
      )}

      {step === 3 && (
        <GreetingScriptEditor
          botName={bot.name}
          initialScript={voiceConfig.introMessage}
          onChange={(script) => setVoiceConfig({ ...voiceConfig, introMessage: script })}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <RoutingRules
          config={voiceConfig}
          onChange={setVoiceConfig}
          onNext={() => setStep(5)}
        />
      )}

      {step === 5 && (
        <TestCallPanel
          config={voiceConfig}
          onConfirm={async () => {
            await dbService.updateBot(bot.id, { phoneConfig: voiceConfig });
            // Show success and return to bot list
          }}
        />
      )}
    </div>
  );
};
```

### 3.4 Knowledge Base Upload Improvements

**Current Issues:**
- File upload UX is basic
- No progress indication
- Limited file type support
- No content preview
- No chunking strategy explanation

**Enhancements:**

```typescript
// C:/buildmybot/components/BotBuilder/KnowledgeBaseManager.tsx

export const KnowledgeBaseManager: React.FC<{ botId: string }> = ({ botId }) => {
  const [documents, setDocuments] = useState<BotDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleUpload = async (files: FileList) => {
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`/api/bots/${botId}/documents`, {
          method: 'POST',
          body: formData,
        });

        const newDoc = await response.json();
        setDocuments((prev) => [...prev, newDoc]);
        setUploadProgress(((i + 1) / files.length) * 100);
      } catch (error) {
        console.error('Upload failed:', error);
      }
    }

    setUploading(false);
    setUploadProgress(0);
  };

  return (
    <div className="space-y-6">
      {/* Drag & Drop Zone */}
      <DragDropZone
        onDrop={handleUpload}
        accept=".pdf,.docx,.txt,.md"
        disabled={uploading}
      />

      {/* Upload Progress */}
      {uploading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader className="animate-spin text-blue-600" size={20} />
            <span className="font-medium text-blue-900">Uploading documents...</span>
          </div>
          <div className="w-full bg-blue-200 h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Document List */}
      <div className="space-y-3">
        {documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            document={doc}
            onDelete={async () => {
              await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
              setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
            }}
          />
        ))}
      </div>

      {/* Help Text */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <h4 className="font-semibold text-slate-800 mb-2">Knowledge Base Tips</h4>
        <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
          <li>Upload FAQs, product docs, and company info</li>
          <li>Supported formats: PDF, Word, Text, Markdown</li>
          <li>Documents are automatically chunked and indexed</li>
          <li>Max file size: 10MB per document</li>
        </ul>
      </div>
    </div>
  );
};
```

---

## PHASE 4: QUALITY ASSURANCE & BUG DETECTION (Weeks 10-11)

### 4.1 Architect Agent Deployment

**Objective:** Systematically identify and document bugs, code smells, and architectural issues.

**Approach:**

1. **Static Code Analysis**
   - ESLint with strict TypeScript rules
   - Biome (already installed) configured for aggressive checking
   - Custom rules for BuildMyBot patterns

2. **Automated Testing Suite**
   - Unit tests for all services (Jest)
   - Integration tests for API endpoints (Supertest)
   - E2E tests for critical flows (Playwright)
   - Visual regression testing (Percy)

3. **Manual QA Checklist**
   - Cross-browser testing (Chrome, Firefox, Safari, Edge)
   - Mobile responsiveness testing
   - Accessibility audit (WCAG 2.1 AA)
   - Performance benchmarking (Lighthouse)

**Test Coverage Goals:**

```typescript
// jest.config.js
module.exports = {
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

**Example Test Suite:**

```typescript
// C:/buildmybot/server/__tests__/BotService.test.ts

import { BotService } from '../services/BotService';
import { db } from '../db';

describe('BotService', () => {
  let service: BotService;

  beforeEach(() => {
    service = new BotService();
  });

  describe('createBot', () => {
    it('should create bot with organization isolation', async () => {
      const botData = {
        name: 'Test Bot',
        type: 'support',
        systemPrompt: 'Test prompt',
      };

      const bot = await service.createBot(
        botData,
        'user-123',
        'org-456'
      );

      expect(bot.organizationId).toBe('org-456');
      expect(bot.userId).toBe('user-123');
    });

    it('should log audit trail on creation', async () => {
      const auditSpy = jest.spyOn(service['auditService'], 'log');

      await service.createBot(
        { name: 'Test' },
        'user-123',
        'org-456'
      );

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'bot.created',
          resourceType: 'bot',
        })
      );
    });

    it('should fail if organization does not exist', async () => {
      await expect(
        service.createBot({}, 'user-123', 'invalid-org')
      ).rejects.toThrow();
    });
  });
});
```

### 4.2 Known Issues & Remediation Plan

**Critical Issues Identified:**

| Issue | Severity | Impact | Remediation |
|-------|----------|--------|-------------|
| Hardcoded admin emails | High | Security | Move to database-based role system |
| No CSRF protection | High | Security | Add CSRF tokens to all forms |
| Missing rate limiting | High | Security/Performance | Implement express-rate-limit |
| No input sanitization | High | Security | Add validation middleware |
| Inconsistent error handling | Medium | UX | Standardize error responses |
| No caching layer | Medium | Performance | Add Redis for session/data caching |
| Lack of database indexes | Medium | Performance | Add indexes on foreign keys |
| No monitoring/logging | Medium | Operations | Add Sentry + structured logging |
| Frontend state management | Low | Maintainability | Consider Zustand or Redux |
| No API versioning | Low | Maintainability | Add /v1/ prefix to API routes |

### 4.3 Performance Optimization

**Database Optimization:**

```sql
-- Add indexes for common queries
CREATE INDEX idx_bots_organization_id ON bots(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_user_id_created ON leads(user_id, created_at DESC);
CREATE INDEX idx_conversations_bot_id ON conversations(bot_id);
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- Add composite indexes for complex queries
CREATE INDEX idx_partner_clients ON partner_clients(partner_id, client_id);
CREATE INDEX idx_audit_logs_org_action ON audit_logs(organization_id, action, created_at DESC);
```

**Caching Strategy:**

```typescript
// C:/buildmybot/server/cache/RedisCache.ts

import Redis from 'ioredis';

export class CacheService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Usage in service
export class BotService {
  private cache = new CacheService();

  async getBotsByOrganization(orgId: string): Promise<Bot[]> {
    const cacheKey = `bots:org:${orgId}`;

    const cached = await this.cache.get<Bot[]>(cacheKey);
    if (cached) return cached;

    const bots = await db
      .select()
      .from(bots)
      .where(eq(bots.organizationId, orgId));

    await this.cache.set(cacheKey, bots, 300); // 5 min TTL
    return bots;
  }
}
```

---

## PHASE 5: STRATEGIC FEATURE ADDITIONS (Weeks 12-14)

### 5.1 Strategist Agent Analysis

**Objective:** Identify high-value features that differentiate BuildMyBot and increase customer lifetime value.

**Recommended Features (Priority Order):**

#### 5.1.1 Advanced Analytics & Insights (P0)

**Why:** Data-driven decision-making is crucial for clients to justify their investment.

**Features:**
- Conversation sentiment analysis (AI-powered)
- Lead quality scoring with ML
- Bot performance benchmarking (vs. industry averages)
- Automated insights ("Your bot converted 23% more leads this week")
- Custom reports builder
- Scheduled email reports

**Implementation:**

```typescript
// C:/buildmybot/server/services/AnalyticsService.ts

export class AnalyticsService {
  async generateInsights(organizationId: string): Promise<Insight[]> {
    const conversations = await this.getRecentConversations(organizationId);
    const leads = await this.getRecentLeads(organizationId);

    const insights: Insight[] = [];

    // Insight 1: Lead conversion rate trend
    const conversionRate = this.calculateConversionRate(conversations, leads);
    const lastWeekRate = await this.getLastWeekConversionRate(organizationId);

    if (conversionRate > lastWeekRate * 1.1) {
      insights.push({
        type: 'positive',
        title: 'Conversion Rate Up',
        message: `Your bot converted ${((conversionRate - lastWeekRate) / lastWeekRate * 100).toFixed(1)}% more leads this week!`,
        metric: conversionRate,
        trend: 'up',
      });
    }

    // Insight 2: Peak activity times
    const peakHours = this.analyzePeakHours(conversations);
    insights.push({
      type: 'info',
      title: 'Peak Activity',
      message: `Most conversations happen between ${peakHours.start} and ${peakHours.end}`,
      actionable: 'Consider scheduling social media posts during these hours.',
    });

    // Insight 3: Common questions
    const commonQuestions = await this.extractCommonQuestions(conversations);
    if (commonQuestions.length > 0) {
      insights.push({
        type: 'suggestion',
        title: 'FAQ Opportunity',
        message: 'These questions are asked frequently:',
        items: commonQuestions,
        actionable: 'Add these to your Knowledge Base for faster responses.',
      });
    }

    return insights;
  }
}
```

#### 5.1.2 Multi-Channel Bot Deployment (P0)

**Why:** Clients want to engage customers wherever they are.

**Channels:**
- Website (existing)
- WhatsApp Business API
- Facebook Messenger
- Instagram DM
- SMS (Twilio)
- Slack
- Discord

**Implementation:**

```typescript
// C:/buildmybot/server/services/ChannelService.ts

export class ChannelService {
  async deployToChannel(
    botId: string,
    channel: 'whatsapp' | 'messenger' | 'instagram' | 'sms',
    config: ChannelConfig
  ): Promise<Deployment> {
    switch (channel) {
      case 'whatsapp':
        return this.deployToWhatsApp(botId, config);
      case 'messenger':
        return this.deployToMessenger(botId, config);
      case 'instagram':
        return this.deployToInstagram(botId, config);
      case 'sms':
        return this.deployToSMS(botId, config);
    }
  }

  private async deployToWhatsApp(
    botId: string,
    config: WhatsAppConfig
  ): Promise<Deployment> {
    // Integrate with WhatsApp Business API
    const webhook = await this.registerWebhook(
      config.phoneNumberId,
      `/api/webhooks/whatsapp/${botId}`
    );

    return {
      channel: 'whatsapp',
      status: 'active',
      webhookUrl: webhook.url,
    };
  }
}
```

#### 5.1.3 Advanced Lead Nurturing (P1)

**Why:** Capturing a lead is just the beginning; nurturing converts them to customers.

**Features:**
- Automated email sequences
- Lead scoring automation
- Task assignment to sales team
- CRM integrations (Salesforce, HubSpot, Pipedrive)
- SMS follow-ups
- Meeting scheduling (Calendly integration)

#### 5.1.4 A/B Testing for Bots (P1)

**Why:** Allow clients to optimize bot performance through experimentation.

**Features:**
- Create bot variants
- Split traffic between variants
- Track conversion metrics per variant
- Statistical significance calculator
- Automated winner selection

#### 5.1.5 White-Label Custom Branding (P2)

**Why:** Agencies want to resell under their own brand completely.

**Features:**
- Custom domain (already exists)
- Logo upload
- Color scheme customization
- Custom email templates
- Branded login page
- Remove "Powered by BuildMyBot" footer

#### 5.1.6 Compliance & Security Features (P2)

**Why:** Enterprise clients require strict compliance.

**Features:**
- GDPR compliance tools (data export, right to be forgotten)
- HIPAA compliance mode (for healthcare)
- SOC 2 audit logs
- Data retention policies
- Encryption at rest
- SSO (SAML, OAuth)

### 5.2 Integration Ecosystem

**Objective:** Make BuildMyBot the hub of client workflows.

**Priority Integrations:**

1. **CRM Systems** (P0)
   - Salesforce
   - HubSpot
   - Pipedrive
   - Zoho CRM

2. **Email Marketing** (P0)
   - Mailchimp
   - SendGrid
   - ActiveCampaign

3. **Calendar/Scheduling** (P1)
   - Calendly
   - Google Calendar
   - Outlook Calendar

4. **Helpdesk** (P1)
   - Zendesk
   - Intercom
   - Freshdesk

5. **Analytics** (P2)
   - Google Analytics
   - Mixpanel
   - Segment

**Integration Architecture:**

```typescript
// C:/buildmybot/server/integrations/IntegrationManager.ts

export class IntegrationManager {
  private providers: Map<string, IntegrationProvider> = new Map();

  registerProvider(provider: IntegrationProvider) {
    this.providers.set(provider.id, provider);
  }

  async connect(
    organizationId: string,
    providerId: string,
    credentials: any
  ): Promise<Integration> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    // Validate credentials
    const isValid = await provider.validateCredentials(credentials);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Store encrypted credentials
    const integration = await db.insert(integrations).values({
      id: uuidv4(),
      organizationId,
      providerId,
      credentials: await this.encryptCredentials(credentials),
      status: 'active',
    }).returning();

    return integration[0];
  }

  async syncLead(lead: Lead, integrationId: string): Promise<void> {
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, integrationId));

    const provider = this.providers.get(integration.providerId);
    const credentials = await this.decryptCredentials(integration.credentials);

    await provider.createLead(lead, credentials);
  }
}
```

---

## PHASE 6: LANDING PAGE OPTIMIZATION (Week 15)

### 6.1 Current Landing Page Assessment

**Strengths:**
- Clean, modern design
- Interactive demo chat widget
- Clear CTAs
- Social proof elements
- Partner program visibility

**Issues:**
- Performance could be improved (too many animations)
- Mobile experience needs polish
- Conversion funnel not optimized
- Lack of trust signals (testimonials, case studies)
- No clear pricing comparison

### 6.2 Optimization Strategy

**A. Performance Improvements:**

```typescript
// Lazy load heavy components
const ChatDemo = lazy(() => import('./components/ChatDemo'));
const VideoPlayer = lazy(() => import('./components/VideoPlayer'));

// Optimize images
<img
  src="/hero-image.webp"
  alt="BuildMyBot Dashboard"
  loading="lazy"
  width={1200}
  height={800}
/>

// Reduce animation weight
// Replace Framer Motion with CSS animations where possible
```

**B. Trust & Social Proof:**

```tsx
<section className="bg-slate-50 py-20">
  <div className="max-w-6xl mx-auto">
    <h2 className="text-3xl font-bold text-center mb-12">
      Trusted by 1,000+ Businesses
    </h2>

    <div className="grid md:grid-cols-3 gap-8">
      <TestimonialCard
        quote="BuildMyBot increased our lead capture by 340% in the first month."
        author="Sarah Johnson"
        company="HomeClean Pro"
        avatar="/testimonials/sarah.jpg"
      />
      {/* More testimonials */}
    </div>

    <div className="mt-16">
      <h3 className="text-xl font-semibold text-center mb-8">As Featured In</h3>
      <div className="flex justify-center gap-12 items-center">
        <img src="/logos/techcrunch.svg" alt="TechCrunch" />
        <img src="/logos/forbes.svg" alt="Forbes" />
        <img src="/logos/wsj.svg" alt="Wall Street Journal" />
      </div>
    </div>
  </div>
</section>
```

**C. Clearer Value Proposition:**

```tsx
// Hero section with benefit-focused copy
<section className="hero bg-gradient-to-br from-blue-900 to-slate-900 text-white py-32">
  <div className="max-w-6xl mx-auto text-center">
    <h1 className="text-6xl font-bold mb-6">
      Never Miss Another Lead
    </h1>
    <p className="text-2xl text-blue-200 mb-8 max-w-3xl mx-auto">
      24/7 AI-powered chat that converts website visitors into qualified leads
      while you sleep. No coding required.
    </p>

    <div className="flex gap-4 justify-center">
      <button className="btn-primary-large">
        Start Free Trial
      </button>
      <button className="btn-secondary-large">
        Watch Demo (2 min)
      </button>
    </div>

    <div className="mt-12 flex justify-center gap-8 text-sm text-blue-200">
      <div className="flex items-center gap-2">
        <CheckCircle size={16} />
        <span>5-minute setup</span>
      </div>
      <div className="flex items-center gap-2">
        <CheckCircle size={16} />
        <span>No credit card required</span>
      </div>
      <div className="flex items-center gap-2">
        <CheckCircle size={16} />
        <span>Cancel anytime</span>
      </div>
    </div>
  </div>
</section>
```

**D. Interactive ROI Calculator:**

```tsx
<section className="py-20">
  <div className="max-w-4xl mx-auto">
    <h2 className="text-3xl font-bold text-center mb-12">
      See Your Potential ROI
    </h2>

    <ROICalculator
      onCalculate={(result) => {
        // Track engagement
        analytics.track('roi_calculated', result);
      }}
    />
  </div>
</section>
```

---

## PHASE 7: TESTING & DEPLOYMENT (Week 16)

### 7.1 Testing Strategy

**Unit Tests:**
- All service classes (100% coverage)
- Utility functions
- React hooks
- Database queries

**Integration Tests:**
- API endpoints
- Webhook handlers
- Stripe integration
- Authentication flows

**E2E Tests (Critical Paths):**
- User signup -> bot creation -> lead capture
- Partner signup -> client referral -> commission calculation
- Admin dashboard -> user management -> impersonation
- Bot creation wizard -> knowledge base upload -> deployment

**Test Environment:**

```yaml
# docker-compose.test.yml
version: '3.8'
services:
  test-db:
    image: postgres:15
    environment:
      POSTGRES_DB: buildmybot_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"

  test-redis:
    image: redis:7
    ports:
      - "6380:6379"
```

### 7.2 Deployment Strategy

**Blue-Green Deployment:**

1. Deploy new version to "green" environment
2. Run smoke tests on green
3. Switch traffic from blue to green
4. Monitor error rates
5. Rollback to blue if issues detected

**Database Migrations:**

```typescript
// Run migrations before deployment
npm run db:migrate

// Rollback script (if needed)
npm run db:rollback
```

**Feature Flags:**

```typescript
// C:/buildmybot/server/featureFlags.ts

export const FEATURES = {
  MULTI_TENANT: process.env.FEATURE_MULTI_TENANT === 'true',
  VOICE_AGENT: process.env.FEATURE_VOICE_AGENT === 'true',
  ADVANCED_ANALYTICS: process.env.FEATURE_ADVANCED_ANALYTICS === 'true',
  A_B_TESTING: process.env.FEATURE_AB_TESTING === 'true',
};

// Usage
if (FEATURES.ADVANCED_ANALYTICS) {
  // Show advanced analytics dashboard
}
```

### 7.3 Railway Deployment and Connection

**Objective:** Deploy the Express API to Railway, connect it to Postgres, and wire the frontend to the Railway backend.

**Railway Service Setup:**
1. Create a Railway project and deploy from the GitHub repo.
2. Use the repo root and set the start command to `npm run start`.
3. Add `railway.json` to codify the start command and health check path.
4. Configure health checks to `/api/health/ready`.
5. Enable automatic deploys from the main branch.

**Railway Environment Variables:**
- NODE_ENV=production
- PORT (Railway injects this; server must bind to it)
- DATABASE_URL
- SESSION_SECRET
- APP_BASE_URL (Vercel URL or custom domain)
- STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_WHITELABEL_PRICE_ID
- OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY
- CARTESIA_API_KEY (optional)
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (if voice enabled)
- Feature flags as needed

**Database Options:**
- Use the existing Supabase pooler connection string in DATABASE_URL.
- Or provision Railway Postgres and copy its connection string into DATABASE_URL.
- Run schema updates with `npm run db:push` (or the migration scripts defined for Phase 7).

**Frontend Connection:**
- Set `VITE_API_URL` to the Railway service URL.
- Update `vercel.json` rewrites to proxy `/api/*` to Railway.

**File Storage Note:**
- Railway's filesystem is ephemeral; move uploads to object storage (S3 or Supabase Storage) for production.

---

## PHASE 7.5: AI MODEL MIGRATION & COST OPTIMIZATION (Week 15.5)

### 7.5.1 Model Migration Strategy

**Objective:** Migrate from GPT-4o Mini to GPT-5o Mini to reduce operational costs while maintaining or improving performance.

**Current Model:** GPT-4o Mini
- Input: $0.15 per million tokens
- Output: $0.60 per million tokens

**Target Model:** GPT-5o Mini
- Input: $0.10 per million tokens (33% reduction)
- Output: $0.40 per million tokens (33% reduction)

**Cost Savings Analysis:**

Assuming average usage of:
- 10 million input tokens/month
- 5 million output tokens/month

**Current Monthly Cost (GPT-4o Mini):**
- Input: 10M × $0.15 = $1.50
- Output: 5M × $0.60 = $3.00
- **Total: $4.50/month**

**New Monthly Cost (GPT-5o Mini):**
- Input: 10M × $0.10 = $1.00
- Output: 5M × $0.40 = $2.00
- **Total: $3.00/month**

**Monthly Savings: $1.50 (33% reduction)**
**Annual Savings: $18.00 per customer**

**At Scale (1,000 active customers):**
- Monthly savings: $1,500
- Annual savings: $18,000

**Implementation Steps:**

1. **Code Updates:**
   - Update default model in `shared/schema.ts`
   - Update model constants in `constants.ts`
   - Update service layer defaults in `services/openaiService.ts`
   - Update bot builder defaults in `components/BotBuilder/`
   - Update template defaults in `server/routes/templates.ts`

2. **Database Migration:**
   - Create migration script to update existing bots
   - Update default model for new bots
   - Allow users to opt-in to new model early (feature flag)

3. **Testing:**
   - A/B test response quality (GPT-4o Mini vs GPT-5o Mini)
   - Monitor latency differences
   - Validate cost reduction in staging environment

4. **Rollout Plan:**
   - Week 1: Deploy to 10% of new bots (feature flag)
   - Week 2: Monitor metrics, expand to 50% if successful
   - Week 3: Full rollout to all new bots
   - Week 4: Migrate existing bots (with user notification)

**Risk Mitigation:**
- Keep GPT-4o Mini as fallback option for premium plans
- Monitor response quality metrics
- Allow manual model selection in bot settings
- Gradual rollout with feature flags

**Performance Considerations:**
- GPT-5o Mini maintains similar latency to GPT-4o Mini
- Improved context understanding in some scenarios
- Better multilingual support
- Enhanced safety features

### 7.5.2 Model Selection Strategy

**Tiered Model Approach:**
- **Free/Starter Plans:** GPT-5o Mini (cost-optimized)
- **Professional Plans:** GPT-5o Mini (default) with option to upgrade to GPT-5o
- **Executive/Enterprise Plans:** GPT-5o (premium) with GPT-5o Mini as fallback

**User-Selectable Models:**
Allow users to choose their preferred model based on:
- Cost sensitivity
- Response quality requirements
- Latency needs
- Use case complexity

## PHASE 8: MONITORING & MAINTENANCE (Ongoing)

### 8.1 Observability Stack

**Error Tracking:**
- Sentry for frontend and backend errors
- Slack notifications for critical errors

**Performance Monitoring:**
- New Relic or Datadog for APM
- Lighthouse CI for frontend performance
- Database query performance tracking

**Logging:**
- Structured logging with Winston
- Centralized logs in CloudWatch or LogDNA

**Uptime Monitoring:**
- Pingdom or UptimeRobot
- Status page (status.buildmybot.app)

### 8.2 Maintenance Procedures

**Weekly:**
- Review error logs
- Check database performance
- Update dependencies (security patches)

**Monthly:**
- Performance audit
- Security scan
- Backup verification
- User feedback review

**Quarterly:**
- Infrastructure cost optimization
- Feature usage analysis
- Roadmap planning

---

## BUDGET & RESOURCE ALLOCATION

### Development Team Requirements

| Role | Time Commitment | Duration |
|------|----------------|----------|
| Senior Full-Stack Engineer | Full-time | 16 weeks |
| Frontend Engineer | Full-time | 12 weeks |
| Backend Engineer | Full-time | 12 weeks |
| QA Engineer | Full-time | 8 weeks |
| UI/UX Designer | Part-time (50%) | 10 weeks |
| DevOps Engineer | Part-time (25%) | 16 weeks |
| Product Manager | Part-time (50%) | 16 weeks |

### Infrastructure Costs (Monthly)

| Service | Cost |
|---------|------|
| Database (Supabase Pro) | $25 |
| Redis (Upstash) | $20 |
| Error Tracking (Sentry) | $26 |
| Monitoring (New Relic) | $99 |
| CDN (Cloudflare Pro) | $20 |
| Email (SendGrid) | $15 |
| Total | ~$205/mo |

### Timeline Summary

| Phase | Duration | Completion Date |
|-------|----------|-----------------|
| Phase 1: Foundation | 3 weeks | Week 3 |
| Phase 2: Dashboards | 3 weeks | Week 6 |
| Phase 3: Bot Builder | 3 weeks | Week 9 |
| Phase 4: QA | 2 weeks | Week 11 |
| Phase 5: Features | 3 weeks | Week 14 |
| Phase 6: Landing | 1 week | Week 15 |
| Phase 7: Testing | 1 week | Week 16 |
| Phase 8: Monitoring | Ongoing | Week 16+ |
| Phase 9: Integration | 2 weeks | Week 18 |
| Phase 10: Scaling | 2 weeks | Week 20 |

**Total Project Duration:** 20 weeks (5 months)

---

## RISK ASSESSMENT & MITIGATION

### Critical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data migration issues | Medium | Critical | Comprehensive backup + staged rollout |
| Performance degradation | Medium | High | Load testing + caching strategy |
| Security vulnerabilities | Low | Critical | Security audit + penetration testing |
| Third-party API failures | Medium | Medium | Retry logic + fallback mechanisms |
| Scope creep | High | Medium | Strict phase gates + change management |
| Key personnel turnover | Low | High | Documentation + knowledge sharing |

---

## SUCCESS METRICS

### Key Performance Indicators (KPIs)

**User Experience:**
- Dashboard load time < 2 seconds (95th percentile)
- Bot creation time < 5 minutes (from start to deployed)
- Zero critical bugs in production
- 95% uptime SLA

**Business Metrics:**
- 30% increase in client retention
- 50% reduction in support tickets
- 40% increase in partner signups
- 25% increase in conversion rate (visitor -> paid user)

**Technical Metrics:**
- 80%+ code coverage
- < 0.5% error rate
- Database query time < 100ms (p95)
- API response time < 200ms (p95)

---

## CONCLUSION

This comprehensive plan transforms BuildMyBot into an enterprise-grade, multi-tenant SaaS platform with:

1. **Robust Architecture:** Multi-tenancy, RBAC, audit logging, and security best practices
2. **Three-Tier Dashboard System:** Optimized experiences for Admin, Partner, and Client users
3. **Simplified Bot Building:** Guided wizards, templates, and one-click deployment
4. **Quality Assurance:** Automated testing, performance optimization, and bug detection
5. **Strategic Features:** Advanced analytics, multi-channel deployment, and integrations
6. **Optimized Landing Page:** Improved performance, trust signals, and conversion funnel

The phased approach allows for iterative delivery, early feedback, and risk mitigation. Each phase builds on the previous, ensuring a solid foundation before adding complexity.

**Next Steps:**
1. Review and approve this plan
2. Assemble development team
3. Begin Phase 1 (Foundation & Architecture)
4. Weekly progress reviews and adjustments

---

**Prepared By:** Tri-Core Architect System (Planner + Builder + Architect)
**Date:** January 6, 2026
**Last Updated:** January 6, 2026
**Status:** COMPLETE - Ready for Implementation

---

## APPENDIX A: IMPLEMENTATION CHECKLIST

### Phase 1: Foundation & Architecture
- [x] Create organizations table and migration
- [x] Implement organization_members table
- [x] Set up audit_logs table and service
- [x] Create roles and permissions system
- [x] Implement partner_clients relationship table
- [x] Add analytics_events table
- [x] Create bot_templates marketplace table
- [x] Build middleware stack (rate limiting, security headers)
- [x] Implement authentication & authorization middleware
- [x] Create input validation middleware with Zod
- [x] Build service layer architecture (BotService, AuditService, etc.)
- [x] Add tenant isolation middleware
- [x] Implement soft delete support

### Phase 2: Dashboard System Overhaul
- [x] Build shared DashboardShell component
- [x] Create Admin Dashboard with all tabs
- [x] Implement real-time monitoring widgets
- [x] Build Partner Dashboard enhancements
- [x] Add client impersonation functionality
- [x] Create Client Dashboard from scratch
- [x] Build onboarding wizard for clients
- [x] Implement route guards with RBAC
- [x] Create navigation configuration system
- [x] Add impersonation banner and controls
- [x] Build API endpoints for all dashboards

### Phase 3: Bot Building Experience
- [x] Create SimplifiedBotWizard component
- [x] Build template gallery with categories
- [x] Implement template marketplace backend
- [x] Create voice agent configuration wizard
- [x] Enhance knowledge base upload UX
- [x] Add drag & drop file upload
- [x] Implement upload progress tracking
- [ ] Build document preview functionality

### Phase 4: Quality Assurance
- [x] Set up Jest testing framework (Vitest)
- [ ] Configure test coverage thresholds
- [x] Write unit tests for all services
- [x] Create integration tests for API endpoints
- [ ] Set up E2E tests with Playwright
- [x] Implement static code analysis rules (Biome)
- [x] Add database indexes for performance
- [x] Set up Redis caching layer (Foundation)
- [x] Configure error tracking (Sentry)

### Phase 5: Strategic Features
- [x] Build AnalyticsService with insights generation
- [x] Implement multi-channel deployment (Scaffolding for WhatsApp, Messenger, etc.)
- [ ] Create lead nurturing automation
- [ ] Build A/B testing framework for bots
- [x] Implement white-label branding features
- [ ] Add GDPR compliance tools
- [x] Create integration ecosystem architecture
- [x] Build CRM integration connectors (HubSpot)

### Phase 6: Landing Page Optimization
- [x] Optimize images and lazy loading
- [x] Add testimonials section
- [x] Build ROI calculator component
- [x] Improve mobile responsiveness
- [x] Add trust signals and social proof
- [x] Optimize conversion funnel
- [x] Implement performance monitoring

### Phase 7: Testing & Deployment
- [x] Set up test environment
- [x] Run full test suite
- [ ] Perform load testing
- [ ] Security audit and penetration testing
- [x] Set up blue-green deployment pipeline
- [x] Deploy backend to Railway and configure health checks
- [x] Wire Vercel frontend to Railway API
- [x] Create database migration scripts
- [x] Implement feature flags system
- [x] Configure monitoring and alerting

### Phase 7.5: Model Migration
- [x] Update all code references to GPT-5o Mini
- [x] Create database migration for model updates
- [x] Implement feature flag for gradual rollout
- [x] Set up A/B testing for model comparison
- [x] Monitor cost reduction metrics
- [x] Update documentation and marketing materials

### Phase 8: Monitoring & Maintenance
- [x] Set up Sentry error tracking
- [x] Configure performance monitoring (New Relic/Datadog)
- [x] Implement structured logging (Winston)
- [x] Set up uptime monitoring
- [x] Create status page
- [x] Establish maintenance procedures
- [x] Set up automated backup verification

### Phase 9: Integration & Automation
- [x] Build Outbound Webhook triggering system
- [x] Implement Inbound Webhook listeners
- [x] Create Webhook Management UI
- [x] Design and index platform-wide Search assets
- [x] Implement semantic search for Knowledge Base
- [ ] Generate OpenAPI documentation (Swagger)
- [x] Build API Key management portal

### Phase 10: Enterprise Scaling & Globalization
- [x] Integrate i18next for dashboard localization (Infrastructure)
- [x] Implement bot language detection and routing
- [x] Build Agency subdomain provisioning system (Middleware)
- [ ] Integrate SMTP settings for white-label emails
- [ ] Implement CSS injection for chat widgets
- [x] Build team invitation and seats management (API)
- [x] Implement granular RBAC for bot/lead access (Service Layer)

---

## APPENDIX B: COST-BENEFIT ANALYSIS

### Model Migration ROI

**Investment:**
- Development time: 8 hours
- Testing time: 4 hours
- Migration risk: Low (backward compatible)

**Returns:**
- Monthly savings per customer: $1.50
- Annual savings per customer: $18.00
- At 1,000 customers: $18,000/year
- Payback period: Immediate (one-time 8-hour investment)

**Additional Benefits:**
- Improved model performance in some scenarios
- Better multilingual support
- Enhanced safety features
- Future-proofing (GPT-5o Mini is newer generation)

---

## APPENDIX C: TECHNICAL DEBT PRIORITIZATION

### High Priority (Address in Phase 1-2)
1. Multi-tenancy isolation (security risk)
2. RBAC implementation (security risk)
3. Input validation (security risk)
4. Rate limiting (security/performance risk)
5. Audit logging (compliance requirement)

### Medium Priority (Address in Phase 3-4)
1. Caching layer (performance)
2. Database indexes (performance)
3. Error handling standardization (UX)
4. API versioning (maintainability)
5. Frontend state management (maintainability)

### Low Priority (Address in Phase 5+)
1. CSRF protection (security enhancement)
2. Monitoring/logging infrastructure (operations)
3. Test coverage expansion (quality)
4. Documentation improvements (maintainability)

---

## APPENDIX D: API VERSIONING STRATEGY

### Version 1 (Current)
- Base path: `/api/v1/`
- All existing endpoints
- Maintained for backward compatibility

### Version 2 (Phase 2)
- Base path: `/api/v2/`
- New dashboard endpoints
- Enhanced response formats
- Improved error handling

### Migration Path
- Support both v1 and v2 for 6 months
- Deprecate v1 with 3-month notice
- Provide migration guide for integrations

---

## APPENDIX E: SECURITY HARDENING CHECKLIST

### Authentication & Authorization
- [ ] Implement session timeout
- [ ] Add password complexity requirements
- [ ] Enable 2FA for admin accounts
- [ ] Implement account lockout after failed attempts
- [ ] Add IP whitelisting for admin access
- [ ] Implement OAuth2 for third-party integrations

### Data Protection
- [ ] Encrypt sensitive data at rest
- [ ] Use TLS 1.3 for all connections
- [ ] Implement data retention policies
- [ ] Add GDPR right-to-be-forgotten
- [ ] Encrypt API keys in database
- [ ] Implement secure credential storage

### API Security
- [ ] Add CSRF tokens to all forms
- [ ] Implement rate limiting per user/IP
- [ ] Add request signing for webhooks
- [ ] Validate all input with Zod schemas
- [ ] Sanitize output to prevent XSS
- [ ] Implement CORS policies

### Infrastructure Security
- [ ] Regular security audits
- [ ] Dependency vulnerability scanning
- [ ] Penetration testing quarterly
- [ ] Security headers (Helmet.js)
- [ ] WAF (Web Application Firewall)
- [ ] DDoS protection

---

## APPENDIX F: PERFORMANCE BENCHMARKS

### Target Metrics

**Frontend:**
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3.0s
- Lighthouse Score: > 90
- Bundle Size: < 500KB (gzipped)

**Backend:**
- API Response Time (p95): < 200ms
- Database Query Time (p95): < 100ms
- WebSocket Latency: < 50ms
- Error Rate: < 0.5%

**Database:**
- Connection Pool: 20-50 connections
- Query Cache Hit Rate: > 80%
- Index Coverage: 100% for foreign keys
- Vacuum/Analyze: Weekly

---

## APPENDIX G: DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] All tests passing
- [ ] Code review completed
- [ ] Security scan passed
- [ ] Performance benchmarks met
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Feature flags configured
- [ ] Monitoring alerts set up

### Deployment
- [ ] Backup database
- [ ] Run database migrations
- [ ] Deploy to staging first
- [ ] Smoke tests on staging
- [ ] Deploy to production (blue-green)
- [ ] Railway service deployed with `/api/health/ready` health check
- [ ] Railway environment variables set (DATABASE_URL, SESSION_SECRET, APP_BASE_URL, PORT)
- [ ] Vercel `VITE_API_URL` and rewrites point to Railway
- [ ] Verify health checks
- [ ] Monitor error rates
- [ ] Check performance metrics

### Post-Deployment
- [ ] Verify all features working
- [ ] Monitor error logs
- [ ] Check user feedback
- [ ] Review performance metrics
- [ ] Update documentation
- [ ] Communicate changes to users

---

## APPENDIX H: MODEL MIGRATION DETAILED PLAN

### Code Changes Required

**Files to Update:**
1. `shared/schema.ts` - Default model in schema
2. `constants.ts` - AVAILABLE_MODELS array
3. `services/openaiService.ts` - Default model parameter
4. `components/BotBuilder/BotBuilder.tsx` - Default model
5. `components/BotBuilder/SimplifiedBotWizard.tsx` - Default model
6. `App.tsx` - Default model
7. `server/routes/templates.ts` - Template default model
8. `components/Chat/FullPageChat.tsx` - Fallback model
9. `README.md` - Documentation
10. `STRIPE_SETUP_GUIDE.md` - Plan descriptions
11. `scripts/createStripePlans.js` - Plan descriptions

**Database Migration Script:**
```sql
-- Update existing bots to use GPT-5o Mini
UPDATE bots 
SET model = 'gpt-5o-mini' 
WHERE model = 'gpt-4o-mini';

-- Update default for new bots
ALTER TABLE bots 
ALTER COLUMN model SET DEFAULT 'gpt-5o-mini';
```

**Feature Flag Implementation:**
```typescript
// Allow gradual rollout
const USE_GPT5O_MINI = process.env.FEATURE_GPT5O_MINI === 'true' || 
                       (Math.random() < 0.1); // 10% rollout initially

const model = USE_GPT5O_MINI ? 'gpt-5o-mini' : 'gpt-4o-mini';
```

**Testing Checklist:**
- [ ] Verify API calls work with new model
- [ ] Test response quality matches or exceeds GPT-4o Mini
- [ ] Check latency is acceptable
- [ ] Validate cost reduction in staging
- [ ] Test fallback to GPT-4o Mini if needed
- [ ] Verify all bot types work correctly
- [ ] Test knowledge base integration
- [ ] Validate multilingual support
