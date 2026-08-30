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
- **Human-like Voice:** Powered by advanced neural speech synthesis (Cartesia & Retell AI).
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

## Deployment Topology

This platform runs on **Vercel** serverless architecture:
- **Frontend:** Vite + React single-page application built with `npm run build:client`.
- **Backend Gateway:** `/api/gateway.ts` handles all `/api/*` REST endpoints with built-in token-bucket rate limiting.
- **Auth Functions:** `/api/auth/*.ts` handles session creation, login, signup, and validation.
- **Database:** Supabase PostgreSQL with vector similarity search for RAG embeddings.

Required environment variables:
- `SUPABASE_URL` / `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_JWT_SECRET`
- `OPENAI_API_KEY`
- `CARTESIA_API_KEY` (optional, for ultra-low latency voice synthesis)

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Backend:** Vercel Serverless Functions
- **Database & Storage:** Supabase PostgreSQL & pgvector
- **AI Models:** OpenAI GPT-4o / GPT-4o Mini / Embeddings
- **Voice:** Cartesia Sonic & Retell AI
- **Icons:** Lucide React

## Getting Started

### Prerequisites
- Node.js 18+
- Supabase Account / Database
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
   Create a `.env` file based on `.env.example`.

4. Start Development Server:
   ```bash
   npm run dev
   ```

5. Run Tests:
   ```bash
   npm test
   ```
