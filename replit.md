# BuildMyBot

## Overview
BuildMyBot is an AI-powered chatbot builder platform that helps businesses automate lead generation and customer support. The application features a React frontend with an Express backend, using PostgreSQL for data persistence.

## Project Architecture

### Tech Stack
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **Backend**: Express 5 + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Payments**: Stripe integration
- **Build Tool**: Vite

### Directory Structure
```
├── components/       # React UI components
├── hooks/           # React custom hooks
├── public/          # Static assets
├── server/          # Express backend
│   ├── middleware/  # Express middleware
│   ├── migrations/  # Database migrations
│   ├── routes/      # API routes
│   ├── seeds/       # Seed data scripts
│   ├── services/    # Business logic services
│   ├── types/       # TypeScript types
│   ├── db.ts        # Database connection
│   └── index.ts     # Server entry point
├── services/        # Frontend services
├── shared/          # Shared types and schema
│   └── schema.ts    # Drizzle database schema
├── src/             # Frontend source
├── App.tsx          # Main React app component
├── index.tsx        # Frontend entry point
└── vite.config.ts   # Vite configuration
```

### Key Configuration
- Frontend runs on port 5000 (0.0.0.0)
- Backend API runs on port 3001 (development) or 5000 (production)
- Vite proxies `/api` requests to backend in development
- `allowedHosts: true` configured for Replit proxy compatibility

### Database
- PostgreSQL database with Drizzle ORM
- Schema defined in `shared/schema.ts`
- Push schema changes: `npm run db:push`
- View database: `npm run db:studio`

### Running the Application
- Development: `npm run dev` (runs both frontend and backend concurrently)
- Production: `npm run build` then `npm run start`

### Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-provided by Replit)
- `APP_BASE_URL` - Base URL for Stripe redirects
- `STRIPE_SECRET_KEY` - Stripe API secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `OPENAI_API_KEY` - OpenAI API key for AI features and OCR
- `CARTESIA_API_KEY` - Cartesia API key for voice agents

## Knowledge Base System

### Architecture
The knowledge base system enables clients to build custom knowledge repositories that power both chatbot and voice agent responses through RAG (Retrieval Augmented Generation).

### Key Components
- **WebScraperService** (`server/services/WebScraperService.ts`): Website crawling and content extraction with rate limiting
- **DocumentProcessorService** (`server/services/DocumentProcessorService.ts`): PDF/DOCX extraction using pdf-parse and mammoth, OCR via OpenAI Vision
- **KnowledgeService** (`server/services/KnowledgeService.ts`): Search and context building for RAG responses
- **Knowledge API** (`server/routes/knowledge.ts`): REST endpoints for scraping, upload, search

### Database Tables
- `knowledge_sources`: Tracks URL and document sources per bot
- `knowledge_chunks`: Stores chunked content with metadata for retrieval

### Features
- Website crawling with configurable depth (1-10 pages)
- Document upload with automatic text extraction (PDF, DOCX, TXT, MD)
- OCR for images and scanned PDFs using OpenAI Vision
- Content chunking and indexing for efficient retrieval
- Relevance-based search with stopword filtering
- Per-client knowledge isolation through tenant/organization context

## Revenue Model Implementation

### Billing Schema (`shared/billing-schema.ts`)
Comprehensive billing foundation with 20+ tables:
- **Plans & Subscriptions**: Tiered plans (Free, Starter, Professional, Enterprise) with Stripe integration
- **Entitlements**: Feature-based access control with usage limits
- **Usage Pools**: SMS, email, and storage credits with consumption tracking
- **Voice Minutes**: Prepaid packages with auto-depletion
- **API Keys**: Rate-limited developer access
- **Services**: One-time professional services catalog
- **Templates**: Premium marketplace with purchase history

### Backend Services
- **BillingService** (`server/services/BillingService.ts`): Plan management, subscriptions, entitlements
- **WhitelabelService** (`server/services/WhitelabelService.ts`): Custom branding, domains, logos
- **ApiKeyService** (`server/services/ApiKeyService.ts`): API key lifecycle, rate limiting

### Revenue API (`server/routes/revenue.ts`)
30+ endpoints organized under `/api/revenue`:
- `/plans`, `/subscriptions`, `/entitlements`
- `/voice-minutes`, `/usage-pools`, `/credits`
- `/whitelabel`, `/api-keys`, `/services`

### Revenue UI Components
- **AdvancedAnalytics** (`components/Analytics/`): Detailed metrics and reporting
- **LandingPageBuilder** (`components/LandingPages/`): Lead capture page creation
- **ServiceCatalog** (`components/Services/`): Professional services ordering
- **SupportTicketSystem** (`components/Support/`): Priority SLA-based support
- **TemplateMarketplace** (`components/Marketplace/`): Premium template purchases
- **VoiceMinutes** (`components/Billing/`): Voice package management
- **UsageCredits** (`components/Billing/`): SMS/email/storage tracking
- **WhiteLabelSettings** (`components/Settings/`): Custom branding configuration
- **ApiKeyManager** (`components/Settings/`): Developer API access

### Navigation Updates
Sidebar includes: Analytics, Landing Pages, Pro Services, Support, and enhanced Billing & Usage

## Admin Broadcast Notification System

### Architecture
Admins can broadcast notifications to all users with optional acknowledgment requirements.

### Database Tables
- `notifications`: Stores broadcast messages with title, body, priority, audience targeting
- `notification_receipts`: Tracks delivery, view, and acknowledgment per user (fan-out pattern)

### Key Components
- **NotificationComposer** (`components/Admin/NotificationComposer.tsx`): Admin UI for creating broadcasts
- **NotificationBell** (`components/Dashboard/NotificationBell.tsx`): User UI with dropdown and popup modals
- **Notifications API** (`server/routes/notifications.ts`): CRUD endpoints for admin and user actions

### Features
- Priority levels: Low, Normal, High, Urgent (with visual indicators)
- Audience targeting: All users, by plan, or by role
- Optional popup modals requiring user acknowledgment
- Real-time stats: delivered/viewed/acknowledged percentages
- Auto-refresh notifications every 30 seconds
- Scheduled notifications with datetime picker

## Recent Changes
- 2026-01-10: Added admin broadcast notification system
  - NotificationComposer for admins to create broadcasts with priority and targeting
  - NotificationBell with popup modal for acknowledgment-required notifications
  - Stats tracking for delivery, views, and acknowledgments
- 2026-01-10: Fixed bot saving bug - changed default ID from timestamp to 'new' sentinel
- 2026-01-10: Replaced all mock data in analytics with real database queries
  - AdvancedAnalytics now queries actual conversations, leads, bots tables
  - AdminFeaturesOverview shows real plan distribution and addon usage
  - Added `/api/admin/analytics/dashboard` endpoint for real-time metrics
- 2026-01-10: Added landing pages table and CRUD API for real storage
- 2026-01-10: Fixed nested button issue in BotBuilder mobile selector
- 2026-01-10: Connected lead capture to database with scoring algorithm
- 2026-01-10: Wired up knowledge base RAG to chat endpoints
- 2026-01-10: Made entire platform mobile-responsive (44-48px touch targets)
- 2026-01-10: Updated chat API to use Replit AI Integrations (no API key needed)
- 2026-01-10: Fixed admin dashboard by adding applyImpersonation middleware
- 2026-01-10: Promoted jadj19@gmail.com to ADMIN role and ENTERPRISE plan
- 2026-01-10: Promoted mreardon@wtpnews.org to ADMIN role and ENTERPRISE plan
- 2026-01-10: Migrated from Supabase to Replit PostgreSQL (Neon-backed)
- 2026-01-08: Complete revenue model with recurring subscriptions, one-time services, usage-based billing
- 2026-01-08: Added 9 revenue-generating UI components with premium styling
- 2026-01-08: Integrated all features into navigation with controlled component pattern
- 2026-01-08: Implemented comprehensive knowledge base with website scraping, document OCR, and RAG integration
- 2026-01-08: Initial Replit setup and configuration

## Data Sources (No Mock Data)
All admin dashboards now use real, live data from the database:
- **User metrics**: Real counts from `users` table
- **Conversation metrics**: Real counts from `conversations` table  
- **Lead metrics**: Real counts from `leads` table with source attribution
- **Plan distribution**: Real user counts grouped by plan
- **Revenue calculations**: Based on actual plan prices × user counts
- **Sentiment analysis**: Real sentiment data from conversation records
- **Peak hours**: Calculated from actual conversation timestamps
- **Landing pages**: Stored in `landingPages` table (not mock data)
