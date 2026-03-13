
# BuildMyBot.app

The ultimate white-label AI chatbot platform for businesses and agencies. Build, deploy, and resell intelligent bots with zero coding.

## Overview

BuildMyBot is an all-in-one AI Operating System that empowers businesses to automate customer interactions across text, web, and voice. It includes a comprehensive suite of tools for lead generation, customer support, and marketing automation.

## Key Features

### AI Bot Builder
- **Specialized Personas:** tailored roles for City Government, Recruitment, Travel, Real Estate, and more.
- **RAG Knowledge Base:** Train bots on PDFs, Website URLs, and text data.
- **Visual Editor:** No-code customization of identity, tone, and behavior.

### AI Phone Agent
- **24/7 Receptionist:** Handles incoming calls, books appointments, and routes urgent issues.
- **Human-like Voice:** Powered by advanced neural speech synthesis.
- **Call Logging:** Transcripts automatically saved to the CRM.

### Lead CRM
- **Hot Lead Detection:** Automatically scores leads (0-100) based on conversation intent.
- **Pipeline Management:** Kanban and List views to manage deal flow.
- **Instant Alerts:** SMS/Email notifications for high-priority leads.

### Marketing Studio
- **Viral Content Generator:** Create high-engagement Twitter/X threads and LinkedIn posts.
- **Instant Website Builder:** Generate industry-specific landing pages in seconds.

### Reseller & Partner Portal
- **White-label Ready:** Agencies can resell the platform under their own brand.
- **Commission Tracking:** Real-time dashboard for earnings, payouts, and client management.
- **Tiered System:** Bronze, Silver, Gold, and Platinum tiers with increasing commission rates.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Express.js API server
- **Database:** Postgres (Neon or Supabase) with Drizzle ORM
- **AI Models:** OpenAI GPT-5o Mini (default) / GPT-4o / GPT-4o Mini
- **Voice:** Cartesia (ultra-realistic voice synthesis)
- **Icons:** Lucide React

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL Database
- OpenAI API Key
- (Optional) Cartesia API Key for voice features
- (Optional) Stripe Account for payments

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/patriotnewsactivism/buildmybot-2026.git
   cd buildmybot-2026
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment:
   Create a `.env` file and add your keys:
   ```env
   # OpenAI
   OPENAI_API_KEY=sk-...

   # Cartesia (for voice agent)
   CARTESIA_API_KEY=...

   # Database (PostgreSQL)
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require

   # Session Secret
   SESSION_SECRET=your_random_secret_here

   # App base URL (used for Stripe redirects/webhooks)
   APP_BASE_URL=https://your-domain.com

   # Stripe (optional)
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_WHITELABEL_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
   See `.env.example` for the full list of optional flags and client-exposed variables.

4. Set up the database:
   ```bash
   # Push schema to database
   npm run db:push

   # Seed initial marketplace templates
   npm run db:seed
   ```

5. Run Development Server:
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:5173`

## Available Scripts

```bash
# Development
npm run dev          # Start both client and server
npm run client       # Start Vite dev server only
npm run server       # Start Express server only

# Building
npm run build        # Build for production
npm run preview      # Preview production build
npm start            # Start production server

# Database
npm run db:push      # Push Drizzle schema to database
npm run db:studio    # Open Drizzle Studio GUI
npm run db:seed      # Seed marketplace templates

# Testing
npm test             # Run tests in watch mode
npm run test:run     # Run tests once
npm run test:ui      # Run tests with UI
npm run test:coverage # Generate coverage report

# Code Quality
npm run lint         # Run Biome linter
```

## Project Structure

```
buildmybot-2026/
├── components/          # React components
│   ├── Admin/          # Admin dashboard
│   ├── Analytics/      # Analytics dashboard (NEW)
│   ├── Auth/           # Authentication
│   ├── BotBuilder/     # Bot creation
│   ├── Chat/           # Chat interface
│   ├── CRM/            # Lead management
│   ├── Landing/        # Landing pages
│   ├── Marketplace/    # Template marketplace
│   ├── Marketing/      # Marketing tools
│   ├── Partner/        # Partner dashboard
│   ├── PhoneAgent/     # Voice agent
│   ├── Reseller/       # Reseller portal
│   ├── SEO/            # SEO components (NEW)
│   ├── Settings/       # Settings
│   ├── UI/             # Reusable components
│   └── WebsiteBuilder/ # Website generator
├── server/             # Express backend
│   ├── middleware/     # Auth, security, validation
│   ├── routes/         # API endpoints
│   ├── seeds/          # Database seeders (NEW)
│   └── services/       # Business logic
├── shared/             # Shared types and schema
│   └── schema.ts       # Drizzle ORM schema
├── test/               # Test files (NEW)
│   ├── components/     # Component tests
│   └── server/         # Server tests
├── PLAN.md             # Engineering roadmap
└── README.md           # This file
```

## Planning Resources

- [Market Readiness Roadmap](./MARKET_READINESS_ROADMAP.md)
- [Engineering Plan](./PLAN.md)

## New in Milestone 2 & 3

### ✅ Template Marketplace (Database-Backed)
- 13+ industry-specific bot templates
- Real-time install tracking
- Category filtering and search
- Connected to PostgreSQL via Drizzle ORM

### ✅ Analytics Dashboard
- Conversion metrics and time series charts
- Bot performance tracking
- Detailed analytics table
- Chart.js visualizations

### ✅ Testing Framework
- Vitest + Testing Library setup
- Component and server tests
- Coverage reporting
- Test UI for debugging

### ✅ SEO Optimization
- Dynamic meta tags
- Open Graph support
- Twitter Card integration
- Canonical URLs

## Live Demos
- **City Services:** City Services Assistant demo with utility payment logic.
- **Instant Training:** Drag-and-drop PDF training.
- **Viral Post Creator:** Content generation engine.
- **Phone Agent:** Interactive call simulator.

---
© 2025 BuildMyBot. All rights reserved.
