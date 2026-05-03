# BuildMyBot.App — Project Chapters

> The ultimate white-label AI chatbot platform for businesses and agencies. Build, deploy, and resell intelligent bots with zero coding.
> **Repo:** `patriotnewsactivism/buildmybot2`
> **Stack:** React + TypeScript + Vite + Tailwind CSS + Express.js + Postgres (Drizzle ORM) + OpenAI

---

## Chapter 1: Foundation & App Shell

**Goal:** Application bootstrapping, routing, layout, and dashboard shell.

| File | Purpose |
|------|---------|
| `index.tsx` | App entry point |
| `App.tsx` | Root component, route definitions |
| `components/Layout/Sidebar.tsx` | Main navigation sidebar |
| `components/Dashboard/DashboardShell.tsx` | Authenticated dashboard wrapper |
| `components/Dashboard/RouteGuard.tsx` | Auth-based route protection |
| `components/Dashboard/NotificationBell.tsx` | In-app notification system |
| `components/UI/ErrorBoundary.tsx` | Global error boundary |
| `hooks/useDashboardContext.tsx` | Dashboard state context |
| `biome.json` | Linter/formatter config |
| `Dockerfile` | Container build definition |
| `.env.example` | Environment variable template |

**Key Concepts:**
- React + Vite frontend with Express.js backend
- Dashboard shell provides consistent layout for all authenticated views
- Route guard enforces auth and role-based access

---

## Chapter 2: Authentication & Onboarding

**Goal:** User registration, login, and first-time setup.

| File | Purpose |
|------|---------|
| `components/Auth/AuthModal.tsx` | Login/signup modal |
| `components/Auth/PartnerSignup.tsx` | Partner/reseller registration |
| `components/Client/OnboardingWizard.tsx` | First-time user onboarding flow |

**Key Concepts:**
- Session-based authentication with Express
- Multi-role system: Admin, Partner, Agency, Client
- Guided onboarding for new users

---

## Chapter 3: Bot Builder

**Goal:** No-code chatbot creation with personas, knowledge base, and tools.

| File | Purpose |
|------|---------|
| `components/BotBuilder/BotBuilder.tsx` | Main bot configuration UI |
| `components/BotBuilder/SimplifiedBotWizard.tsx` | Simplified wizard for quick bot creation |
| `components/BotBuilder/KnowledgeBaseManager.tsx` | RAG knowledge base — PDFs, URLs, text |
| `components/BotBuilder/TemplateGallery.tsx` | Pre-built bot templates |
| `components/BotBuilder/ToolBuilder.tsx` | Custom tool/action builder |
| `components/BotBuilder/VoiceAgentConfig.tsx` | Voice agent configuration |
| `components/BotBuilder/widgets/ApprovalQueue.tsx` | Content approval workflow |
| `components/BotBuilder/widgets/TestExecutionPanel.tsx` | Test bot execution |
| `components/BotBuilder/widgets/ToolList.tsx` | Manage bot tools |
| `components/BotBuilder/widgets/WebhookDesigner.tsx` | Webhook configuration |
| `components/Knowledge/PrebuiltKnowledgeSelector.tsx` | Pre-built knowledge pack selection |

**Key Concepts:**
- Specialized personas: City Government, Recruitment, Travel, Real Estate, etc.
- RAG knowledge base trained on PDFs, website URLs, and text
- Visual no-code editor for identity, tone, and behavior
- Custom tools/actions the bot can perform
- Template gallery for quick-start bots

---

## Chapter 4: AI Phone Agent

**Goal:** Voice-based AI receptionist that handles calls, books appointments, routes issues.

| File | Purpose |
|------|---------|
| `components/PhoneAgent/PhoneAgent.tsx` | Phone agent configuration and management |
| `components/PhoneAgent/VoiceCallSimulator.tsx` | Test voice calls in-browser |
| `components/PhoneAgent/VoiceSetupWizard.tsx` | Voice agent setup flow |
| `components/PhoneAgent/AudioWaveform.tsx` | Real-time audio visualization |
| `components/Agent/AgentDashboard.tsx` | Agent activity and call logs |

**Key Concepts:**
- 24/7 AI receptionist for incoming calls
- Cartesia neural speech synthesis for human-like voice
- Call logging with automatic transcript saving to CRM
- Appointment booking and urgent issue routing

---

## Chapter 5: Lead CRM

**Goal:** Track leads, score intent, and manage the sales pipeline.

| File | Purpose |
|------|---------|
| `components/CRM/LeadsCRM.tsx` | Full CRM — Kanban and list views |

**Key Concepts:**
- Automatic lead scoring (0-100) based on conversation intent
- Pipeline management with Kanban and list views
- SMS/email alerts for high-priority leads
- Lead source tracking from bot conversations

---

## Chapter 6: Chat & Conversation Management

**Goal:** View and manage bot-customer conversations.

| File | Purpose |
|------|---------|
| `components/Chat/ChatLogs.tsx` | Conversation history and search |
| `components/Chat/FullPageChat.tsx` | Full-screen chat interface |
| `components/UI/ConversationTranscript.tsx` | Formatted conversation transcript |

---

## Chapter 7: Analytics & Metrics

**Goal:** Business intelligence, bot performance, and usage analytics.

| File | Purpose |
|------|---------|
| `components/Analytics/AnalyticsDashboard.tsx` | Main analytics dashboard |
| `components/Analytics/AdvancedAnalytics.tsx` | Deep-dive analytics |
| `components/Analytics/ComprehensiveAnalytics.tsx` | Full analytics suite |
| `components/Analytics/AdminFeaturesOverview.tsx` | Admin-level feature usage stats |
| `components/UI/MetricCard.tsx` | Metric display card |
| `components/UI/PlayfulMetricCard.tsx` | Animated metric card |
| `components/UI/QuickMetricsWidget.tsx` | Quick-glance metrics widget |
| `components/UI/DataTable.tsx` | Reusable data table |

---

## Chapter 8: Marketing Studio

**Goal:** AI-generated content, landing pages, and marketing tools.

| File | Purpose |
|------|---------|
| `components/Marketing/MarketingTools.tsx` | Viral content generator — Twitter/X, LinkedIn |
| `components/LandingPages/LandingPageBuilder.tsx` | Instant landing page builder |
| `components/WebsiteBuilder/WebsiteBuilder.tsx` | Full website builder |
| `components/SEO/SEO.tsx` | SEO optimization tools |

**Key Concepts:**
- AI-generated high-engagement social media content
- Instant industry-specific landing page generation
- Website builder for bot deployment pages
- SEO tools for organic traffic

---

## Chapter 9: Billing & Monetization

**Goal:** Subscription management, usage credits, and payment processing.

| File | Purpose |
|------|---------|
| `components/Billing/Billing.tsx` | Subscription management |
| `components/Billing/UsageCredits.tsx` | Credit balance and usage tracking |
| `components/Billing/VoiceMinutes.tsx` | Voice agent minute tracking |
| `components/Services/ServiceCatalog.tsx` | Service/add-on catalog |
| `components/UI/ReferralBanner.tsx` | Referral program promotion |

**Key Concepts:**
- Stripe integration for subscriptions
- Usage-based credit system for API calls
- Voice minute tracking for phone agent
- Referral program for growth

---

## Chapter 10: Partner & Reseller Portal

**Goal:** White-label reselling with commission tracking and client management.

| File | Purpose |
|------|---------|
| `components/Partner/PartnerDashboardV2.tsx` | Partner home — earnings, clients, materials |
| `components/Partner/widgets/ClientManagement.tsx` | Manage partner's clients |
| `components/Partner/widgets/CommissionsEarnings.tsx` | Commission tracking and payouts |
| `components/Partner/widgets/PartnerAnalytics.tsx` | Partner performance analytics |
| `components/Partner/widgets/MarketingMaterials.tsx` | Partner marketing resources |
| `components/Partner/widgets/CollaborationHub.tsx` | Partner collaboration tools |
| `components/Reseller/ResellerDashboard.tsx` | Reseller-specific dashboard |
| `components/Reseller/LandingPage.tsx` | Reseller landing page |
| `components/Affiliate/AffiliateDashboard.tsx` | Affiliate program dashboard |

**Key Concepts:**
- White-label ready: agencies resell under their own brand
- Tiered commission system: Bronze, Silver, Gold, Platinum
- Real-time earnings dashboard with payout tracking
- Marketing materials and co-branded resources

---

## Chapter 11: Agency Management

**Goal:** Multi-client agency billing, pricing, and profit tracking.

| File | Purpose |
|------|---------|
| `components/Agency/AgencyBillingDashboard.tsx` | Agency billing overview |
| `components/Agency/widgets/ClientUsageBreakdown.tsx` | Per-client usage details |
| `components/Agency/widgets/PricingConfigurator.tsx` | Custom pricing for agency clients |
| `components/Agency/widgets/ProfitAnalytics.tsx` | Profit margin analytics |
| `components/Agency/widgets/WalletManagement.tsx` | Agency wallet and balance |

**Key Concepts:**
- Agency manages multiple client accounts
- Custom pricing configuration per client
- Profit analytics: cost vs. revenue per client
- Wallet system for prepaid credit management

---

## Chapter 12: Admin Dashboard

**Goal:** Platform-wide administration and user management.

| File | Purpose |
|------|---------|
| `components/Admin/AdminDashboard.tsx` | Admin overview |
| `components/Admin/AdminDashboardV2.tsx` | Enhanced admin dashboard |
| `components/Admin/NotificationComposer.tsx` | Send notifications to users |
| `components/Admin/PartnerDetailModal.tsx` | Partner detail view |
| `components/Admin/PartnerOverviewAdmin.tsx` | Admin partner management |
| `components/Admin/widgets/FinancialDashboard.tsx` | Revenue and financial metrics |
| `components/Admin/widgets/LiveMetrics.tsx` | Real-time platform metrics |
| `components/Admin/widgets/PartnerOversight.tsx` | Partner performance oversight |
| `components/Admin/widgets/SystemAnalytics.tsx` | System health and usage |
| `components/Admin/widgets/UserManagement.tsx` | User CRUD and role management |

---

## Chapter 13: Marketplace

**Goal:** Bot template marketplace for buying/selling bot configurations.

| File | Purpose |
|------|---------|
| `components/Marketplace/Marketplace.tsx` | Browse marketplace |
| `components/Marketplace/EnhancedMarketplace.tsx` | Enhanced marketplace with filters |
| `components/Marketplace/TemplateMarketplace.tsx` | Template-specific marketplace |

---

## Chapter 14: Settings & Integrations

**Goal:** API keys, webhooks, white-label, and third-party integrations.

| File | Purpose |
|------|---------|
| `components/Settings/Settings.tsx` | Main settings page |
| `components/Settings/ApiKeyManager.tsx` | API key generation and management |
| `components/Settings/Integrations.tsx` | Third-party integration setup |
| `components/Settings/WebhookManagement.tsx` | Webhook configuration |
| `components/Settings/WhiteLabelSettings.tsx` | White-label branding customization |
| `components/Client/ClientOverview.tsx` | Client account overview |

**Key Concepts:**
- API key management for external integrations
- Webhook configuration for event notifications
- White-label settings: custom domain, colors, logo
- Integration setup for CRM, email, SMS providers

---

## Chapter 15: Support & Help

**Goal:** Help center, support tickets, and compliance.

| File | Purpose |
|------|---------|
| `components/Support/HelpCenter.tsx` | Self-service help center |
| `components/Support/SupportTicketSystem.tsx` | Support ticket creation and tracking |
| `components/Support/CookieConsent.tsx` | GDPR cookie consent banner |
| `components/Status/StatusPage.tsx` | Platform status page |
| `components/UI/UnifiedSearch.tsx` | Global search across the platform |
| `components/UI/SaveIndicator.tsx` | Auto-save status indicator |

---

## Chapter 16: Public Pages & Marketing

**Goal:** Landing page, pricing, about, and content marketing.

| File | Purpose |
|------|---------|
| `components/Landing/LandingPage.tsx` | Main landing/marketing page |
| `components/Landing/PartnerProgramPage.tsx` | Partner program landing |
| `components/Landing/pages/AboutPage.tsx` | About BuildMyBot |
| `components/Landing/pages/ArticlePage.tsx` | Blog article template |
| `components/Landing/pages/BlogPage.tsx` | Blog listing |
| `components/Landing/pages/CareersPage.tsx` | Careers page |
| `components/Landing/pages/ContactPage.tsx` | Contact form |
| `components/Landing/pages/DemoPage.tsx` | Interactive demo |
| `components/Landing/pages/FaqPage.tsx` | FAQ |
| `components/Landing/pages/FeaturesPage.tsx` | Features showcase |
| `components/Landing/pages/PricingPage.tsx` | Pricing tiers |
| `components/Landing/pages/PrivacyPage.tsx` | Privacy policy |
| `components/Landing/pages/PageLayout.tsx` | Shared public page layout |

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────┐
│                 Frontend (React + Vite)                    │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐  │
│  │ Bot      │  │ Phone    │  │ CRM    │  │ Marketing │  │
│  │ Builder  │  │ Agent    │  │ Leads  │  │ Studio    │  │
│  │ Ch. 3    │  │ Ch. 4    │  │ Ch. 5  │  │ Ch. 8     │  │
│  └──────────┘  └──────────┘  └────────┘  └───────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐  │
│  │ Partner  │  │ Agency   │  │ Admin  │  │ Market-   │  │
│  │ Portal   │  │ Billing  │  │ Panel  │  │ place     │  │
│  │ Ch. 10   │  │ Ch. 11   │  │ Ch. 12 │  │ Ch. 13    │  │
│  └──────────┘  └──────────┘  └────────┘  └───────────┘  │
└───────────────────────┬──────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────┐
│              Express.js API Server                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ Auth/    │  │ Bot      │  │ Stripe               │   │
│  │ Sessions │  │ Runtime  │  │ Subscriptions        │   │
│  │ Ch. 2    │  │ Ch. 3-4  │  │ Ch. 9                │   │
│  └──────────┘  └──────────┘  └──────────────────────┘   │
└───────────────────────┬──────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────┐
│                 Data Layer                                │
│  ┌───────────────────────────────────────────────────┐   │
│  │ PostgreSQL (Neon/Supabase) + Drizzle ORM         │   │
│  │ Users, Bots, Conversations, Leads, Partners      │   │
│  └───────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
        │                              │
┌───────┴────────┐          ┌──────────┴──────────┐
│ OpenAI API     │          │ Cartesia Voice      │
│ (GPT-5o Mini)  │          │ (Neural TTS)        │
│ Ch. 3, 4       │          │ Ch. 4               │
└────────────────┘          └─────────────────────┘
```
