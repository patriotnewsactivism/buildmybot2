# BuildMyBot.App — Project Chapters

> The ultimate white-label AI chatbot platform for businesses and agencies. Build, deploy, and resell intelligent bots with zero coding.
> **Repo:** `patriotnewsactivism/buildmybot2`
> **Stack:** React + TypeScript + Vite + Tailwind CSS + Express.js + Postgres (Drizzle ORM) + OpenAI + Cartesia Voice

---

## Chapter 1: Foundation & App Shell

**Goal:** Application bootstrapping, routing, layout, and dashboard shell.

| File | Purpose |
|------|---------|
| `index.tsx` | App entry point |
| `App.tsx` | Root component, route definitions |
| `constants.ts` | App-wide constants |
| `types.ts` | Shared TypeScript type definitions |
| `vite-env.d.ts` | Vite type declarations |
| `components/Layout/Sidebar.tsx` | Main navigation sidebar |
| `components/Dashboard/DashboardShell.tsx` | Authenticated dashboard wrapper |
| `components/Dashboard/RouteGuard.tsx` | Auth-based route protection |
| `components/Dashboard/NotificationBell.tsx` | In-app notification system |
| `components/Dashboard/dashboardNav.ts` | Dashboard navigation config |
| `components/UI/ErrorBoundary.tsx` | Global error boundary |
| `components/UI/SaveIndicator.tsx` | Auto-save status indicator |
| `hooks/useDashboardContext.tsx` | Dashboard state context |

**Configuration & Build:**

| File | Purpose |
|------|---------|
| `index.html` | HTML shell, Vite entry |
| `vite.config.ts` | Vite build configuration |
| `vitest.config.ts` | Vitest test config |
| `biome.json` | Linter/formatter config (Biome) |
| `tsconfig.json` | TypeScript config |
| `tailwind.config.js` | Tailwind CSS config |
| `postcss.config.js` | PostCSS config |
| `package.json` | Dependencies and scripts |
| `package-lock.json` | Dependency lock file |
| `bun.lock` | Bun lock file |
| `Dockerfile` | Container build definition |
| `.dockerignore` | Docker build exclusions |
| `railway.json` | Railway deployment config |
| `vercel.json` | Vercel deployment config |
| `.vercelignore` | Vercel ignore rules |
| `nginx.conf` | Nginx reverse proxy config |
| `_headers` | Custom HTTP headers (Cloudflare/Vercel) |
| `_redirects` | URL redirect rules |
| `.replit` | Replit run config |
| `.env.example` | Environment variable template |
| `.gitignore` | Git ignore rules |
| `.gitattributes` | Git attributes |
| `metadata.json` | App metadata |
| `gateway.ts` | API gateway configuration |
| `check_db.ts` | Database connection checker |
| `drizzle.config.ts` | Drizzle ORM config |

**Styles:**

| File | Purpose |
|------|---------|
| `src/index.css` | Root CSS (Tailwind imports) |
| `styles/animations.css` | Custom animation CSS |
| `styles/designTokens.ts` | Design system tokens |
| `styles/professionalTokens.ts` | Professional theme tokens |

**Documentation:**

| File | Purpose |
|------|---------|
| `README.md` | Project documentation |
| `AGENTS.md` | AI agent instructions |
| `CLAUDE.md` | Claude AI instructions |
| `GEMINI.md` | Gemini AI instructions |
| `TODO.md` | Development TODO list |
| `PLAN.md` | Development plan |
| `STRIPE_SETUP_GUIDE.md` | Stripe setup guide |
| `STRIPE_WEBHOOK_SETUP.md` | Stripe webhook setup |
| `README-ADMIN-SETUP.md` | Admin setup guide |
| `DEPLOYMENT_STATUS.md` | Deployment status |
| `VERCEL_DEPLOYMENT.md` | Vercel deployment guide |
| `docs/DATABASE_MIGRATIONS.md` | DB migration guide |
| `docs/DATABASE_SEEDS.md` | DB seed guide |
| `docs/DATABASE_UPGRADE_CHECKLIST.md` | DB upgrade checklist |
| `COMPREHENSIVE_UPGRADE_PLAN.md` | Full upgrade plan |
| `MASTER_UPGRADE_PLAN.md` | Master upgrade plan |
| `MARKET_READINESS_ROADMAP.md` | Market readiness roadmap |
| `OPTIMIZATION_PLAN.md` | Optimization plan |
| `LAUNCH_FIXES_TODO.md` | Launch fixes |
| `IMPLEMENTATION_STATUS.md` | Feature status |
| `AGENTIC_OS_EXECUTIVE_SUMMARY.md` | Agentic OS summary |
| `AGENTIC_OS_TRANSFORMATION_STATUS.md` | Transformation status |
| `EXECUTIVE_SUMMARY.md` | Executive summary |
| `SESSION_SUMMARY.md` / `SESSION_COMPLETE.md` | Session notes |
| `PHASE0-9_*.md` (multiple) | Phase progress docs |
| `MODEL_MIGRATION_SUMMARY.md` | Model migration notes |
| `KNOWLEDGE_BASE_ANALYSIS.md` / `KNOWLEDGE_BASE_TEST.md` | KB analysis |
| `FIX_AUTH_ISSUE.md` | Auth fix notes |
| `FAQ_SECTION_STATUS.md` | FAQ status |
| `COOKIE_TEST_RESULTS.md` | Cookie test results |
| `FINAL_VERIFICATION_REPORT.md` | Verification report |
| `QUADRAGENT_DEPLOYMENT_COMPLETE.md` | Deployment complete notes |
| `TEST_COVERAGE_80_PERCENT.md` / `TEST_COVERAGE_EXPANSION.md` | Test coverage docs |
| `TESTING_SUMMARY.md` / `TEST_RESULTS.md` | Test results |

---

## Chapter 2: Authentication & Onboarding

**Goal:** User registration, login, and first-time setup.

| File | Purpose |
|------|---------|
| `components/Auth/AuthModal.tsx` | Login/signup modal |
| `components/Auth/PartnerSignup.tsx` | Partner/reseller registration |
| `components/Client/OnboardingWizard.tsx` | First-time user onboarding flow |
| `hooks/useAuth.ts` | Auth hook — login, logout, session management |

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
| `components/UI/DataTable.tsx` | Reusable data table component |

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

## Chapter 17: Frontend Services & API Layer

**Goal:** Frontend API clients and service utilities.

| File | Purpose |
|------|---------|
| `services/apiConfig.ts` | API base URL and endpoint config |
| `services/authUtils.ts` | Auth token utilities |
| `services/dbService.ts` | Frontend database service client |
| `services/firebaseConfig.ts` | Firebase configuration |
| `services/geminiService.ts` | Gemini AI client |
| `services/openaiService.ts` | OpenAI API client |

---

## Chapter 18: Backend Server — Core

**Goal:** Express server setup, database, auth, and middleware.

| File | Purpose |
|------|---------|
| `server/index.ts` | Server entry point — starts Express |
| `server/db.ts` | Database connection (Drizzle + Postgres) |
| `server/env.ts` | Environment variable validation |
| `server/stripeClient.ts` | Stripe client initialization |
| `server/stripeService.ts` | Stripe billing service |
| `server/webhookHandlers.ts` | Webhook event handlers |
| `server/featureFlags.ts` | Feature flag management |
| `server/config/admins.ts` | Admin user configuration |
| `server/types/express.d.ts` | Express type extensions |

**Middleware:**

| File | Purpose |
|------|---------|
| `server/middleware/index.ts` | Middleware barrel export |
| `server/middleware/auth.ts` | Authentication middleware |
| `server/middleware/audit.ts` | Audit logging middleware |
| `server/middleware/impersonation.ts` | Admin impersonation middleware |
| `server/middleware/launchGate.ts` | Launch gate / feature gate |
| `server/middleware/logger.ts` | Request logging |
| `server/middleware/metrics.ts` | Performance metrics collection |
| `server/middleware/security.ts` | Security headers and protection |
| `server/middleware/subdomain.ts` | Subdomain routing (white-label) |
| `server/middleware/tenant.ts` | Multi-tenant isolation |
| `server/middleware/validation.ts` | Request validation |

**Utilities:**

| File | Purpose |
|------|---------|
| `server/utils/encryption.ts` | Data encryption/decryption |
| `server/utils/errorHandler.ts` | Centralized error handling |
| `server/utils/logger.ts` | Structured logging |
| `server/utils/originValidation.ts` | Origin/CORS validation |
| `server/utils/sentry.ts` | Sentry error tracking |

---

## Chapter 19: Backend Server — API Routes

**Goal:** All REST API endpoints.

| File | Purpose |
|------|---------|
| `server/routes/index.ts` | Route barrel export / registration |
| `server/routes/auth.ts` | Auth routes — login, register, session |
| `server/routes/admin.ts` | Admin routes — user management, platform stats |
| `server/routes/agency.ts` | Agency routes — client management, billing |
| `server/routes/analytics.ts` | Analytics routes — metrics, reports |
| `server/routes/audit.ts` | Audit log routes |
| `server/routes/channels.ts` | Channel management routes |
| `server/routes/chat.ts` | Chat/conversation routes |
| `server/routes/clients.ts` | Client management routes |
| `server/routes/health.ts` | Health check endpoint |
| `server/routes/impersonation.ts` | Admin impersonation routes |
| `server/routes/integrations.ts` | Third-party integration routes |
| `server/routes/knowledge.ts` | Knowledge base CRUD routes |
| `server/routes/landingPages.ts` | Landing page builder routes |
| `server/routes/leads.ts` | CRM leads routes |
| `server/routes/notifications.ts` | Notification routes |
| `server/routes/organizations.ts` | Organization management routes |
| `server/routes/partners.ts` | Partner/reseller routes |
| `server/routes/phone.ts` | Phone agent routes |
| `server/routes/revenue.ts` | Revenue reporting routes |
| `server/routes/salesAgents.ts` | Sales agent routes |
| `server/routes/search.ts` | Global search routes |
| `server/routes/team.ts` | Team management routes |
| `server/routes/templates.ts` | Bot template routes |
| `server/routes/tools.ts` | Bot tool routes |
| `server/routes/twilioWebhooks.ts` | Twilio webhook handler |
| `server/routes/voice.ts` | Voice agent routes |
| `server/routes/voiceAgents.ts` | Voice agent management routes |
| `server/routes/webhooks.ts` | General webhook routes |

---

## Chapter 20: Backend Server — Services

**Goal:** Business logic layer — all backend services.

| File | Purpose |
|------|---------|
| `server/services/index.ts` | Service barrel export |
| `server/services/AgencyBillingService.ts` | Agency billing logic |
| `server/services/AnalyticsService.ts` | Analytics data aggregation |
| `server/services/ApiKeyService.ts` | API key generation and validation |
| `server/services/AuditService.ts` | Audit trail logging |
| `server/services/BillingService.ts` | Subscription billing logic |
| `server/services/BotService.ts` | Bot CRUD and configuration |
| `server/services/ChannelService.ts` | Channel management (web, SMS, etc.) |
| `server/services/ChatService.ts` | Chat processing and response generation |
| `server/services/DocumentProcessorService.ts` | Document ingestion for knowledge base |
| `server/services/EmbeddingService.ts` | Text embeddings for RAG search |
| `server/services/FirecrawlService.ts` | Website crawling for knowledge base |
| `server/services/IntegrationService.ts` | Third-party integration management |
| `server/services/KnowledgeChunker.ts` | Text chunking for knowledge base |
| `server/services/KnowledgeRepairService.ts` | Knowledge base repair/reindex |
| `server/services/KnowledgeService.ts` | Knowledge base CRUD and search |
| `server/services/LeadAlertService.ts` | High-priority lead alerts (SMS, email) |
| `server/services/LeadService.ts` | Lead management and scoring |
| `server/services/NotificationService.ts` | In-app notification management |
| `server/services/NurtureService.ts` | Lead nurturing automation |
| `server/services/OpenAIService.ts` | OpenAI API integration |
| `server/services/OrganizationService.ts` | Multi-org management |
| `server/services/SearchService.ts` | Global search across entities |
| `server/services/SystemMetricsService.ts` | System health metrics |
| `server/services/ToolExecutionService.ts` | Bot tool execution engine |
| `server/services/TwilioService.ts` | Twilio SMS/voice integration |
| `server/services/UserService.ts` | User management |
| `server/services/VoiceAgentService.ts` | Voice agent orchestration |
| `server/services/WebScraperService.ts` | Web scraping for knowledge base |
| `server/services/WebhookService.ts` | Webhook delivery management |
| `server/services/WhitelabelService.ts` | White-label branding service |

**Integration Providers:**

| File | Purpose |
|------|---------|
| `server/services/integrations/IntegrationProvider.ts` | Base integration provider interface |
| `server/services/integrations/HubSpotProvider.ts` | HubSpot CRM integration |

---

## Chapter 21: Backend Server — Voice System

**Goal:** Voice agent infrastructure — TTS, STT, and call management.

| File | Purpose |
|------|---------|
| `server/voice/voiceAgentManager.ts` | Voice agent lifecycle management |
| `server/voice/voiceAgentController.ts` | Voice agent API controller |
| `server/voice/types.ts` | Voice system type definitions |
| `server/voice/providers/custom.ts` | Custom voice provider |
| `server/voice/providers/retell.ts` | Retell AI voice provider |
| `server/voice/providers/vapi.ts` | Vapi voice provider |
| `server/services/voice/CartesiaService.ts` | Cartesia neural TTS service |
| `server/services/voice/RetellService.ts` | Retell voice service |
| `server/services/voice/TwilioService.ts` | Twilio voice service |

---

## Chapter 22: Standalone Voice Agent Service

**Goal:** Standalone Node.js voice agent service (separate deployment).

| File | Purpose |
|------|---------|
| `voice-agent/server.js` | Voice agent server entry point |
| `voice-agent/src/services/llm/LLMProvider.js` | Base LLM provider interface |
| `voice-agent/src/services/llm/OpenAILLM.js` | OpenAI LLM integration |
| `voice-agent/src/services/llm/index.js` | LLM barrel export |
| `voice-agent/src/services/stt/STTProvider.js` | Base STT provider interface |
| `voice-agent/src/services/stt/DeepgramSTT.js` | Deepgram speech-to-text |
| `voice-agent/src/services/stt/index.js` | STT barrel export |
| `voice-agent/src/services/tts/TTSProvider.js` | Base TTS provider interface |
| `voice-agent/src/services/tts/CartesiaTTS.js` | Cartesia neural TTS |
| `voice-agent/src/services/tts/ElevenLabsTTS.js` | ElevenLabs TTS |
| `voice-agent/src/services/tts/ShadowTTS.js` | Shadow TTS provider |
| `voice-agent/src/services/tts/MockTTS.js` | Mock TTS for testing |
| `voice-agent/src/services/tts/index.js` | TTS barrel export |
| `voice-agent/scripts/verify-shadow.js` | Shadow TTS verification |
| `voice-agent/package.json` | Voice agent dependencies |
| `voice-agent/.env.example` | Voice agent env template |

**Key Concepts:**
- Modular provider architecture: swap TTS/STT/LLM providers
- Multiple TTS options: Cartesia, ElevenLabs, Shadow
- Deepgram for speech-to-text
- OpenAI for conversation logic
- Standalone deployment for scalability

---

## Chapter 23: Database Schema & Migrations

**Goal:** Database schema, migrations, and seed data.

**Schema:**

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Core database schema (Drizzle) — users, bots, conversations, leads, etc. |
| `shared/schema-agentic-os.ts` | Agentic OS extension schema |
| `shared/schema-migrations.ts` | Schema migration utilities |
| `shared/schema-monitoring.ts` | Monitoring/metrics schema |
| `shared/billing-schema.ts` | Billing and subscription schema |
| `shared/models/auth.ts` | Auth model types |
| `shared/models/chat.ts` | Chat model types |

**Migrations (Drizzle):**

| File | Purpose |
|------|---------|
| `drizzle/0000_parallel_whiplash.sql` | Initial schema |
| `drizzle/0001_fix_bots_schema.sql` | Bot schema fixes |
| `drizzle/0002_knowledge_sources_processing.sql` | Knowledge source processing |
| `drizzle/0003_knowledge_chunks_embeddings.sql` | Knowledge chunks and embeddings |
| `drizzle/0004_voice_agent_extension.sql` | Voice agent schema |
| *(+ additional migration files)* | Ongoing schema evolution |

**Server-side Migrations:**

| File | Purpose |
|------|---------|
| `server/migrations/002_consolidated_indexes.ts` | Performance indexes |
| `server/migrations/003_monitoring_table_indexes.ts` | Monitoring indexes |
| `server/migrations/addPerformanceIndexes.ts` | Additional performance indexes |
| `server/migrations/migrateToOrganizations.ts` | Organization migration |

**Seeds:**

| File | Purpose |
|------|---------|
| `server/seeds/industryKnowledgeBases.ts` | Pre-built industry knowledge packs |
| `server/seeds/revenue-seed.ts` | Revenue demo data |
| `server/seeds/seedTemplates.ts` | Bot template seed data |
| `server/seeds/seedUserRoles.ts` | User role seed data |

---

## Chapter 24: Scripts & Tooling

**Goal:** CLI scripts for database management, testing, and deployment.

| File | Purpose |
|------|---------|
| `scripts/migrate.ts` | Run database migrations |
| `scripts/runMigrations.ts` | Migration runner |
| `scripts/runDataMigration.ts` | Data migration |
| `scripts/lib/migrationRunner.ts` | Migration runner library |
| `scripts/seed.ts` | Seed database |
| `scripts/applySupabaseMigrations.ts` | Apply Supabase migrations |
| `scripts/deployModelMigration.ts` | Deploy model migration |
| `scripts/verifyModelMigration.ts` | Verify model migration |
| `scripts/verifyDeployment.ts` | Verify deployment |
| `scripts/setup-db-extensions.ts` | Setup DB extensions (pgvector) |
| `scripts/check-pgvector.ts` | Check pgvector extension |
| `scripts/testDbConnection.ts` | Test DB connection |
| `scripts/debug-db.ts` | Debug DB issues |
| `scripts/debug-db-6543.ts` | Debug DB on port 6543 |
| `scripts/test-connections.ts` | Test all connections |
| `scripts/createStripePlans.js` | Create Stripe subscription plans |
| `scripts/seedStripeProducts.ts` | Seed Stripe products |
| `scripts/setAdminPermissions.ts` | Set admin permissions |
| `scripts/checkAdminData.ts` | Check admin data |
| `scripts/checkBotSchema.ts` | Validate bot schema |
| `scripts/repairKnowledge.ts` | Repair knowledge base |
| `scripts/testInstall.ts` | Test install |
| `scripts/test-knowledge-base.js` | Test knowledge base |
| `scripts/test-knowledge-api.js` | Test knowledge API |
| `scripts/test-login.js` | Test login flow |
| `scripts/test-pdf-upload.js` | Test PDF upload |
| `scripts/test-simple-scrape.js` | Test web scraping |
| `scripts/test-wikipedia-scrape.js` | Test Wikipedia scraping |
| `scripts/check-railway-env.js` | Check Railway env vars |
| `scripts/check-scrape-status.js` | Check scrape job status |
| `scripts/renderMarketingPdfs.mjs` | Render marketing PDFs |

---

## Chapter 25: Serverless Functions

**Goal:** Vercel/Cloudflare serverless API functions.

| File | Purpose |
|------|---------|
| `functions/api/[[path]].ts` | Catch-all serverless API route |

---

## Chapter 26: Marketing Documentation

**Goal:** Sales enablement, partner playbooks, and marketing materials.

| File | Purpose |
|------|---------|
| `docs/marketing/README.md` | Marketing docs overview |
| `docs/marketing/messaging-and-positioning.md` | Brand messaging and positioning |
| `docs/marketing/one-pager.md` | Product one-pager |
| `docs/marketing/sales-deck.md` | Sales deck content |
| `docs/marketing/industry-pitches.md` | Industry-specific pitch scripts |
| `docs/marketing/objection-handling.md` | Objection handling guide |
| `docs/marketing/templates-and-scripts.md` | Email/call script templates |
| `docs/marketing/demo-checklist.md` | Demo preparation checklist |
| `docs/marketing/case-study-template.md` | Case study template |
| `docs/marketing/partner-playbook.md` | Partner sales playbook |
| `docs/marketing/partner-course.md` | Partner training course |
| `docs/marketing/agent-playbook.md` | Sales agent playbook |
| `docs/marketing/agent-start-free-course.md` | Agent onboarding course |
| `docs/marketing/client-onboarding-guide.md` | Client onboarding guide |
| `docs/marketing/client-success-guide.md` | Client success guide |
| `docs/marketing/field-operations-manual.md` | Field operations manual |
| `docs/marketing/ghost-shopper-audit-template.md` | Mystery shopper audit |
| `docs/marketing/revenue-recovery-handbook.md` | Revenue recovery handbook |
| `docs/marketing/pdf-style.css` | Marketing PDF stylesheet |

---

## Chapter 27: Test Suite

**Goal:** Unit, integration, and E2E tests.

**Component Tests:**

| File | Purpose |
|------|---------|
| `test/setup.ts` | Test setup and configuration |
| `test/vitest-setup.d.ts` | Vitest type declarations |
| `test/components/BotBuilder/KnowledgeBaseManager.test.tsx` | Knowledge base tests |
| `test/components/Dashboard/DashboardShell.test.tsx` | Dashboard shell tests |
| `test/components/Dashboard/RouteGuard.test.tsx` | Route guard tests |
| `test/components/Marketplace.test.tsx` | Marketplace tests |
| `test/components/OnboardingWizard.test.tsx` | Onboarding wizard tests |

**Integration Tests:**

| File | Purpose |
|------|---------|
| `test/integration/dashboard-flow.test.tsx` | Dashboard flow integration tests |
| `test/integration/bot-persistence.test.ts` | Bot persistence tests |
| `test/integration/bot-simple.test.ts` | Simple bot tests |

**Middleware Tests:**

| File | Purpose |
|------|---------|
| `test/middleware/authentication.test.ts` | Auth middleware tests |
| `test/middleware/tenant-isolation.test.ts` | Tenant isolation tests |
| `test/middleware/validation-security.test.ts` | Validation/security tests |

**Service Tests:**

| File | Purpose |
|------|---------|
| `test/services/documentProcessorService.test.ts` | Document processor tests |
| `test/services/openaiService.test.ts` | OpenAI service tests |
| `test/services/originValidation.test.ts` | Origin validation tests |
| `test/services/services-integration.test.ts` | Services integration tests |
| `test/services/voiceAgentService.test.ts` | Voice agent tests |
| `test/services/webScraperService.test.ts` | Web scraper tests |

**Server & E2E Tests:**

| File | Purpose |
|------|---------|
| `test/server/templates.test.ts` | Template route tests |
| `test/e2e/user-flows.test.ts` | User flow E2E tests |

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
│  ┌──────────────────────────────────────────────────┐    │
│  │ Frontend Services (API clients, auth utils)       │    │
│  │ Ch. 17                                            │    │
│  └──────────────────────────────────────────────────┘    │
└───────────────────────┬──────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────┐
│         Express.js API Server (Ch. 18-21)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ 11 Mid-  │  │ 29 API   │  │ 31 Services          │   │
│  │ dleware  │  │ Routes   │  │ (Business Logic)     │   │
│  │ Ch. 18   │  │ Ch. 19   │  │ Ch. 20               │   │
│  └──────────┘  └──────────┘  └──────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Voice System — 9 voice providers                  │   │
│  │ Ch. 21                                            │   │
│  └──────────────────────────────────────────────────┘   │
└───────────────────────┬──────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────┐
│            Standalone Voice Agent (Ch. 22)                │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Modular LLM + STT + TTS provider architecture    │   │
│  │ Deepgram STT, Cartesia/ElevenLabs TTS, OpenAI    │   │
│  └──────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────┐
│                 Data Layer (Ch. 23)                        │
│  ┌───────────────────────────────────────────────────┐   │
│  │ PostgreSQL (Neon/Supabase) + Drizzle ORM          │   │
│  │ 7 schema files, 5+ SQL migrations, 4 seed files  │   │
│  └───────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
        │                    │                    │
┌───────┴──────┐   ┌────────┴───────┐   ┌───────┴────────┐
│ OpenAI API   │   │ Cartesia Voice │   │ Twilio SMS/    │
│ GPT-5o Mini  │   │ Neural TTS     │   │ Voice          │
│ Ch. 3, 20    │   │ Ch. 21-22      │   │ Ch. 21         │
└──────────────┘   └────────────────┘   └────────────────┘
```

---

## File Counts by Chapter

| Chapter | Files |
|---------|-------|
| Ch. 1: Foundation | 13 source + 26 config + 35+ docs |
| Ch. 2: Auth | 4 |
| Ch. 3: Bot Builder | 11 |
| Ch. 4: Phone Agent | 5 |
| Ch. 5: CRM | 1 |
| Ch. 6: Chat | 3 |
| Ch. 7: Analytics | 8 |
| Ch. 8: Marketing Studio | 4 |
| Ch. 9: Billing | 5 |
| Ch. 10: Partner Portal | 9 |
| Ch. 11: Agency | 5 |
| Ch. 12: Admin | 10 |
| Ch. 13: Marketplace | 3 |
| Ch. 14: Settings | 6 |
| Ch. 15: Support | 5 |
| Ch. 16: Public Pages | 13 |
| Ch. 17: Frontend Services | 6 |
| Ch. 18: Backend Core | 24 |
| Ch. 19: API Routes | 29 |
| Ch. 20: Backend Services | 33 |
| Ch. 21: Voice System | 9 |
| Ch. 22: Standalone Voice Agent | 16 |
| Ch. 23: Schema & Migrations | 15+ |
| Ch. 24: Scripts | 30 |
| Ch. 25: Serverless | 1 |
| Ch. 26: Marketing Docs | 19 |
| Ch. 27: Tests | 20 |
| **Total** | **~350+ source + config** |
