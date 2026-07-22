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

## Deployment topology (read this first)

This repo has a single production path:

**Vercel** — the Vite client plus the serverless functions in `api/`
(`api/gateway.ts` handles all `/api/*` routes, `api/auth/*.ts` handles
login/signup/session). These talk to Supabase over its REST API.
`vercel.json` builds with `npm run build:client`. Required env vars:
`SUPABASE_SERVICE_ROLE_KEY`, `SESSION_JWT_SECRET`, `VITE_SUPABASE_URL`
(see `.env.example`).

There is no Express server, Dockerfile, or Railway config in this repo —
an earlier local-dev Express path (`server/`) was planned but never
actually committed (it depended on Drizzle tables and a `shared/types`
module that don't exist here), so there is nothing to run or deploy
outside of the Vercel path above. Note: `package.json` still has a few
stray scripts (`dev`, `server`, `start`, `check:server`, several
`seed:*`) referencing that non-existent `server/` — they will fail if
run, and cleaning them up is a separate, not-yet-done task.

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
   git clone https://github.com/patriotnewsactivism/buildmybot2.git
   cd buildmybot2
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
   ```

   
   Ensure to check the README for all necessary environment variables and details on deployment processes.

## Additional Notes

To successfully run the local server, ensure you also initialize your database and test the API endpoints through `npm run server`. For production deployment on Vercel, refer to the Vercel guide and ensure all environmental variables are correctly set up according to the `.env.example` file.