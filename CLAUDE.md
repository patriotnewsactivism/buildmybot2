# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
```bash
npm run dev          # Start both client (Vite) and server (Express) concurrently
npm run client       # Start Vite dev server only (port 5000)
npm run server       # Start Express API server only (port 3001)
```

### Building & Production
```bash
npm run build        # Compile TypeScript and build production bundle
npm start            # Start production server (NODE_ENV=production)
npm run preview      # Preview production build locally
```

### Database Operations
```bash
# Modern unified system (RECOMMENDED)
npm run db:migrate              # Run all pending migrations
npm run db:migrate:status       # Show migration history
npm run db:migrate:down         # Rollback last migration
npm run db:seed                 # Run all seeds in order
npm run db:seed -- --force      # Force re-run all seeds
npm run db:seed -- --only=user-roles  # Run specific seed only
npm run db:setup                # Run migrations + seeds (initial setup)
npm run db:push                 # Push Drizzle schema changes to PostgreSQL
npm run db:studio               # Open Drizzle Studio GUI for database inspection

# Legacy commands (DEPRECATED - use above instead)
npm run migrate:schema          # DEPRECATED: Use db:migrate
npm run migrate:data            # DEPRECATED: Use db:migrate
npm run seed:roles              # DEPRECATED: Use db:seed --only=user-roles
npm run set-admin-permissions   # DEPRECATED: Admin permissions set via db:seed
```

### Testing
```bash
npm test             # Run Vitest in watch mode
npm run test:run     # Run tests once and exit
npm run test:ui      # Launch Vitest UI for interactive test debugging
npm run test:coverage # Generate coverage report

# Run a single test file
npx vitest run test/components/MyComponent.test.tsx

# Run tests matching a pattern
npx vitest run -t "should render"
```

### Code Quality
```bash
npm run lint         # Run Biome linter (DO NOT use ESLint/Prettier)
```

### Local Development with Supabase
```bash
# Start local Supabase (requires Docker Desktop)
npx supabase start   # Starts all services (DB, Studio, Auth, Storage, etc.)
npx supabase stop    # Stop all services
npx supabase status  # Check status of running services

# Database management
npx supabase db reset   # Reset local database to initial state
npx supabase db push    # Push schema changes to local database
npx supabase db diff    # Show diff between local and remote schemas
```

**Local Database URL**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
**Supabase Studio**: `http://127.0.0.1:54323` (visual database editor)

**Environment Setup**:
- `.env` - Contains production/remote database credentials
- `.env.local` - Overrides for local development (use local Supabase URL)
- Both config files (`drizzle.config.ts`, `server/index.ts`) load `.env.local` if it exists

**Workflow**:
1. Start local Supabase: `npx supabase start`
2. Create `.env.local` with: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`
3. Run migrations: `npm run db:migrate`
4. Seed data: `npm run db:seed`
5. Start dev server: `npm run dev`

## Architecture Overview

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS 4
- **Backend**: Express.js (Node.js API server)
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenAI GPT-5o Mini (default), GPT-4o, GPT-4o Mini
- **Voice**: Cartesia API for text-to-speech synthesis
- **Payments**: Stripe for subscriptions and billing
- **Testing**: Vitest + Testing Library

### Project Structure
```
buildmybotapp/
├── components/          # React components organized by feature
│   ├── Admin/          # Admin dashboard & widgets
│   ├── Analytics/      # Analytics dashboards
│   ├── Auth/           # Authentication modals
│   ├── BotBuilder/     # Bot creation & configuration
│   ├── Chat/           # Chat interface & logs
│   ├── CRM/            # Lead management
│   ├── Dashboard/      # Core dashboard shell & routing
│   ├── Landing/        # Public landing pages
│   ├── Marketplace/    # Bot template marketplace
│   ├── Partner/        # Partner/reseller dashboards
│   ├── PhoneAgent/     # Voice agent configuration
│   └── Settings/       # User/org settings
├── server/
│   ├── middleware/     # Auth, security, validation, tenant isolation
│   ├── routes/         # API endpoints (organized by domain)
│   ├── services/       # Business logic layer
│   ├── migrations/     # Database migration scripts
│   └── seeds/          # Database seed scripts
├── shared/
│   ├── schema.ts       # Drizzle ORM schema (single source of truth)
│   ├── models/auth.ts  # Auth-specific schemas (sessions)
│   └── billing-schema.ts # Billing-related schemas
├── hooks/              # React custom hooks
├── test/               # Vitest test files
└── scripts/            # Utility scripts for migrations, setup
```

### Multi-Tenancy Architecture
The platform uses an **organization-based multi-tenancy model**:
- **Organizations** (`organizations` table) are the primary tenant boundary
- **Users** belong to organizations via `organizationMembers` with role-based permissions
- **Bots, Leads, Conversations** are scoped to organizations via `organizationId`
- **Middleware**: `loadOrganizationContext` + `tenantIsolation` enforce data isolation
- **Partner Model**: Partners can have multiple client organizations with impersonation capabilities

### Database Schema (`shared/schema.ts`)
Key tables and relationships:
- **Core Entities**: `users`, `organizations`, `bots`, `leads`, `conversations`
- **Multi-tenancy**: `organizationMembers`, `roles`, `partnerClients`
- **Knowledge Base**:
  - `knowledgeSources` - Stores uploaded documents/URLs with processing status
  - `knowledgeChunks` - Stores chunked text with embeddings (pgvector, 1536 dimensions)
  - `botDocuments` - LEGACY table, being migrated to `knowledgeSources`
- **Analytics**: `analyticsEvents` (tracks user interactions)
- **Billing**: `discountCodes`, `freeAccessCodes` (promotions)
- **Security**: `auditLogs`, `impersonationSessions`
- **Templates**: `botTemplates` (marketplace templates)
- **Migrations**: `migrationHistory` - Tracks schema/data migrations with checksums

All tables with `organizationId` MUST use tenant isolation middleware.

### API Architecture
Express routes are organized by domain in `server/routes/`:
- `/api/organizations` - Organization management
- `/api/admin` - System admin operations
- `/api/partners` - Partner dashboard & client management
- `/api/clients` - Client relationship management
- `/api/analytics` - Analytics & metrics
- `/api/templates` - Bot template marketplace
- `/api/knowledge` - Knowledge base (documents, URLs)
- `/api/chat` - AI chat conversations
- `/api/channels` - Multi-channel integrations
- `/api/audit` - Audit log retrieval
- `/api/impersonation` - User impersonation for support
- `/api/leads` - Lead management
- `/api/notifications` - User notifications
- `/api/revenue` - Revenue tracking
- `/api/landing-pages` - Landing page management

**Authentication Flow**:
- Session-based auth using `express-session` + PostgreSQL session store
- `authenticate` middleware checks session
- `loadOrganizationContext` loads user's org context into `req.org`
- `tenantIsolation` enforces org-scoped queries

### Frontend Routing
The app uses client-side routing managed in `App.tsx`:
- **Dashboard Views**: Controlled via `currentView` state
- **Role-Based Dashboards**:
  - `MasterAdmin` → `AdminDashboardV2` (system-wide management)
  - `Partner` → `PartnerDashboardV2` (client & commission management)
  - `Client` → `ClientOverview` (single org view)
  - Default → Main dashboard (bot builder, CRM, analytics)
- **Context Provider**: `DashboardProvider` wraps the app for shared state
- **Route Guards**: `RouteGuard` component enforces authentication

### AI & Knowledge Base
- **Bot Configuration**: `bots` table stores `systemPrompt`, `model`, `temperature`, `knowledgeBase`
- **RAG System**:
  - `knowledgeSources` stores uploaded docs/URLs with processing status tracking
  - `knowledgeChunks` stores chunked text with pgvector embeddings (1536 dimensions)
  - `DocumentProcessorService` handles PDF/DOCX/TXT parsing and text extraction
  - `WebScraperService` crawls and extracts website content with Readability
  - `EmbeddingService` generates OpenAI embeddings (text-embedding-3-small)
  - `KnowledgeChunker` splits text into overlapping chunks (~500-1000 tokens)
  - `KnowledgeRepairService` reconciles broken/incomplete knowledge sources
- **Chat Flow**: Client → `/api/chat` → OpenAI API → Vector similarity search → Context injection → Response
- **Self-Healing**: `scripts/repairKnowledge.ts` can detect and repair incomplete ingestions

### Authentication & Security
- **Master Admins**: Hardcoded list in `App.tsx` (`MASTER_ADMINS = ['mreardon@wtpnews.org']`)
- **Permissions**: Role-based via `roles` table with JSON permissions array
- **Middleware Stack**: `securityHeaders` → `apiLimiter` → `authenticate` → `loadOrganizationContext` → `tenantIsolation`
- **Impersonation**: Admins/Partners can impersonate users with audit logging

### Stripe Integration
- **Products**: Plans defined in `constants.ts` (FREE, STARTER, PROFESSIONAL, EXECUTIVE, ENTERPRISE)
- **Webhook Handler**: `/api/stripe/webhook` processes subscription events
- **Service**: `stripeService.ts` handles subscription creation/updates
- **White-label**: Separate $499/month subscription for partners

## Development Guidelines

### Database Changes
1. Modify `shared/schema.ts` (single source of truth)
2. Run `npm run db:push` to push schema changes to database
3. For production migrations, create migration in `scripts/migrate.ts`:
   - Add to `MIGRATIONS` array with version, name, and up() function
   - Run `npm run db:migrate` to apply
   - Check status with `npm run db:migrate:status`
4. For SQL migrations, place in `server/migrations/` and reference in migrate.ts
5. TypeScript types are automatically exported from schema.ts

### Adding New API Routes
1. Create route file in `server/routes/`
2. Export from `server/routes/index.ts`
3. Register in `server/index.ts` with appropriate middleware
4. Apply `authenticate`, `loadOrganizationContext`, `tenantIsolation` if org-scoped

### Multi-Tenant Queries
Always filter by `organizationId` when querying tenant-scoped tables:
```typescript
// ✅ CORRECT
const bots = await db.select().from(bots).where(eq(bots.organizationId, req.org.id));

// ❌ WRONG - data leak risk
const bots = await db.select().from(bots);
```

### Testing Strategy
- **Component Tests**: `test/components/` - use Testing Library
- **Integration Tests**: `test/integration/` - test full user flows
- **Server Tests**: `test/server/` - test API routes
- **Service Tests**: `test/services/` - test business logic
- **Setup File**: `test/setup.ts` provides jest-dom matchers, cleanup, and global mocks

Run tests before committing. Use `npm run test:ui` to debug failing tests.

### Environment Variables
Required variables (see `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - OpenAI API key
- `SESSION_SECRET` - Session encryption secret
- `APP_BASE_URL` - Base URL for redirects (production)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` - Stripe keys
- `CARTESIA_API_KEY` - Voice synthesis (optional)

### Model Selection
- Default: `gpt-5o-mini` (fast, cost-effective, 33% cheaper than gpt-4o-mini)
- Use `gpt-4o` only for complex reasoning tasks
- Configure in bot settings via `model` field

### Code Style
- **Linter**: Biome (NOT ESLint/Prettier)
- **Formatting**: Run `npm run lint` before committing
- **TypeScript**: Strict mode enabled, fix all type errors
- **Quotes**: Single quotes, semicolons required, 2-space indent
- **Imports**: Use `@/` alias for root imports, `@shared/` for shared
- **Test Imports**: Vitest config adds `@components/` and `@server/` aliases

## Common Patterns

### Creating a New Bot Template
1. Add template data to `server/seeds/seedTemplates.ts`
2. Run `npm run db:seed` (or `npm run db:seed -- --only=bot-templates` for just templates)
3. Template appears in marketplace (`/api/templates`)

### Adding a New Database Seed
1. Create seed function in `server/seeds/yourSeed.ts`
2. Add to `SEEDS` array in `scripts/seed.ts` with order and dependencies
3. Run `npm run db:seed` to execute in order
4. Use `--force` flag to re-run seeds

### Adding a New Service
1. Create service class in `server/services/`
2. Export from `server/services/index.ts`
3. Inject dependencies via constructor
4. Use in routes/controllers

### Implementing Role-Based Access
1. Check user role via `req.user.role` (from session)
2. Use `authorize(['MasterAdmin', 'Partner'])` middleware for route protection
3. Add custom permissions to `roles` table for fine-grained control

## Deployment

### Vercel Deployment (Frontend)

The frontend can be deployed to Vercel with the following steps:

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel --prod
   ```

3. **Environment Variables** (set in Vercel dashboard):
   - `VITE_API_URL` - Backend API URL (e.g., https://api.yourdomain.com)
   - `VITE_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
   - Other VITE_* variables as needed

4. **vercel.json Configuration**:
   - Frontend build outputs to `dist/`
   - API routes are proxied to backend URL (configure in vercel.json)
   - Security headers are automatically applied

### Backend Deployment

The Express backend should be deployed separately to:
- **Railway** (recommended for ease of use)
- **Render** (free tier available)
- **Fly.io** (global edge deployment)
- **Vercel Pro** (serverless functions with longer execution time)

**Backend Environment Variables**:
- `DATABASE_URL` - PostgreSQL connection string (Supabase pooler recommended)
- `SESSION_SECRET` - Random secret for session encryption
- `OPENAI_API_KEY` - OpenAI API key
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `APP_BASE_URL` - Frontend URL for redirects
- `CARTESIA_API_KEY` - (Optional) Voice synthesis

### Database

- **Recommended**: Supabase (connection pooler for reliability)
- **Alternative**: Neon, Railway Postgres
- **Connection**: Use pooler URL for production: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`

### Production Checklist

1. Run migrations: `npm run db:migrate`
2. Seed data: `npm run db:seed`
3. Update `MASTER_ADMINS` in `App.tsx` with production admin emails
4. Set all environment variables in deployment platform
5. Configure Stripe webhook URL in Stripe dashboard
6. Test authentication flow
7. Verify API connectivity between frontend and backend
8. Run knowledge repair: `tsx scripts/repairKnowledge.ts` (if migrating existing data)

## Common Utilities & Scripts

### Knowledge Base Management
```bash
# Repair broken/incomplete knowledge sources
tsx scripts/repairKnowledge.ts

# Test knowledge base API
node scripts/test-knowledge-api.js
node scripts/test-knowledge-base.js

# Test document upload
node scripts/test-pdf-upload.js
```

### Database Utilities
```bash
# Check database connection
tsx scripts/testDbConnection.ts

# View migration history
npm run db:migrate:status

# Rollback migrations
npm run db:migrate:down -- --steps=1
```

## Known Issues & Gotchas

- **Port Configuration**: Dev client (5000) proxies API requests to server (3001)
- **Environment Files**: `.env.local` overrides `.env` (both are loaded). Use `.env.local` for local Supabase development to avoid connecting to production database
- **Session Expiry**: Sessions expire after inactivity period (configured in `server/index.ts`)
- **Master Admin**: Hardcoded email list - update `App.tsx` MASTER_ADMINS for production
- **Model Migration**: System migrated from GPT-4o Mini to GPT-5o Mini as default
- **Windows Development**: Use `tsx` instead of `ts-node` for script execution
- **Docker Required**: Local Supabase requires Docker Desktop to be running
- **pgvector Extension**: Required for knowledge base embeddings - automatically installed by migrations
- **Legacy Migration**: Old `botDocuments` table is deprecated; use `knowledgeSources` + `knowledgeChunks`
- **File Uploads**: Stored in `/tmp/uploads` on Vercel, `./uploads` locally (10MB limit)
