# BuildMyBot.app - Gemini Context

## Project Overview
**BuildMyBot.app** is a white-label AI chatbot platform that enables businesses and agencies to build, deploy, and resell intelligent bots without coding. It features a React frontend, Node.js/Express backend, and PostgreSQL database.

## Architecture
- **Frontend:** Single Page Application (SPA) built with React, TypeScript, and Vite. Uses Tailwind CSS for styling.
- **Backend:** REST API built with Node.js and Express. Handles business logic, authentication, and AI service integration.
- **Database:** PostgreSQL managed via Drizzle ORM. Supports multi-tenancy and organization-based isolation.
- **AI Integration:** Integrates with OpenAI (text generation) and Cartesia (voice synthesis).
- **Authentication:** Session-based auth using `connect-pg-simple`. Supports Roles (Admin, Partner, Client).

## Key Directories
- `components/`: React components organized by feature (e.g., `BotBuilder`, `Admin`, `CRM`).
- `server/`: Backend source code.
    - `routes/`: API route definitions.
    - `middleware/`: Auth, rate limiting, and tenant isolation middleware.
    - `services/`: Business logic (Stripe, AI, DB interactions).
- `shared/`: Shared code between frontend and backend, primarily `schema.ts` (Drizzle schema) and types.
- `drizzle/`: Database migration files.
- `scripts/`: Maintenance scripts (migrations, seeding, admin permissions).

## Development Workflow

### Prerequisites
- Node.js 18+
- PostgreSQL Database
- `.env` file configured (see `.env.example`).

### Key Commands
- **Start Dev Server:** `npm run dev` (Runs client and server concurrently).
    - Client: `http://localhost:5173` (proxies `/api` to backend).
    - Server: `http://localhost:3001`.
- **Database Management:**
    - Push Schema: `npm run db:push`
    - Open Studio: `npm run db:studio`
    - Seed Data: `npm run db:seed`
- **Testing:**
    - Run Tests: `npm test` or `npm run test:run`
- **Linting:** `npm run lint` (Biome).

## Conventions
- **Styling:** Tailwind CSS.
- **State Management:** React Context / Hooks.
- **Database Access:** Drizzle ORM query builder.
- **Type Safety:** Strict TypeScript usage. Shared types in `shared/`.
- **API Pattern:** RESTful routes in `server/routes/`, prefixed with `/api`.

## Current Status (January 2026)
- **Phase:** Upgrade to Enterprise-Grade (Phase 4 completed).
- **Recent Changes:**
    - Multi-tenant architecture implementation.
    - Enhanced dashboards for Admins, Partners, and Clients.
    - Integration of "Architect" agents for QA.
    - Migration to Drizzle ORM.

## Environment Variables
Key variables include:
- `DATABASE_URL`: PostgreSQL connection string.
- `OPENAI_API_KEY`: For AI features.
- `CARTESIA_API_KEY`: For voice agent features.
- `STRIPE_SECRET_KEY`: For billing.
