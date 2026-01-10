# BuildMyBot.app – Engineering Plan

This document defines the **architecture**, **schema**, **feature completion**, **roadmap**, and **development workflow** for the BuildMyBot.app platform.

---

# 1. System Architecture

**Current Architecture:**
React + Vite (Frontend SPA)
↓
Express.js API Server
↓
Replit PostgreSQL (Drizzle ORM)
↓
OpenAI GPT-4o (LLM + embeddings)

---

# 2. Database Schema

Tables are defined in the Drizzle schema (shared/schema.ts):

- `users` - User profiles  
- `bots` - Bot configurations  
- `leads` - Captured leads  
- `conversations` - Chat conversations  

---

# 3. Application Modules

### 3.1. Bot Builder
- Prompt editing  
- Model selection  
- Temperature tuning  
- Bot settings  
- Knowledge base management  
- Preview chat  
- **Specialized Personas:** City Government, Recruitment, Travel, Real Estate, etc.

### 3.2. Knowledge Base
- File upload (PDF)  
- URL crawler  
- Text ingestion  
- Search during conversations  

### 3.3. Chat Interface
- Real-time messages  
- Session attribution  
- Lead capture triggers  
- Conversation history  

### 3.4. CRM
- Lead pipeline (Kanban/List)
- Lead scoring (Hot Lead detection)
- CSV export  
- Notes & metadata  

### 3.5. Marketing Studio
- Emails  
- Ads  
- Blog posts  
- Scripts  
- Social posts  
- Viral Thread Generator

### 3.6. Website Generator
- Page editor  
- SEO metadata  
- Bot embed snippet  

### 3.7. Phone Agent
- Call flow  
- Webhooks → transcripts  
- Call logging  

### 3.8. Marketplace
- Template installation  
- Preview UI  
- Category filters  

### 3.9. Reseller System
- Referral tracking  
- Commission tracking  
- Client oversight  
- White-label configuration

---

# 4. Frontend Architecture

### **Patterns**
- React + Vite
- Tailwind CSS for styling
- Express.js API for backend operations
- Drizzle ORM for database access

### **Directory Structure**
- `components/*` – UI modules  
- `services/*` – API helpers  
- `server/*` – Express API server  
- `shared/*` – Drizzle schema and types  

---

# 5. API Endpoints

- `GET/POST/PUT /api/bots` - Bot CRUD operations
- `GET/POST /api/leads` - Lead management
- `GET/POST/PUT /api/users` - User profiles
- `GET/POST/PUT /api/conversations` - Chat conversations

All endpoints support `?userId=` query parameter for filtering.

---

# 6. Operational Roadmap

## Milestone 1 – Core Features (Complete)
- Bot builder integration  
- Chat + AI completions  
- CRM/lead views  
- Database setup  

## Milestone 2 – Marketplace, Website Builder, Phone Agent
- Template marketplace  
- Website generator  
- Phone agent MVP  
- Landing page upgrades  

## Milestone 3 – Hardening & Launch
- Testing framework  
- Logging + Analytics dashboards  
- SEO & landing page polish  
- Final docs  

---

# 7. DevOps & Deployment

### Database
```bash
npm run db:push
npm run db:studio
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

---

# 8. Security
- User-scoped data access
- No secrets shipped to frontend
- API key management via environment variables

---

# 9. Post-Launch Plans
- Webhook integrations (Zapier, Make.com)
- Agency white-label domain system
- Team seats
- User roles inside organization
- Advanced analytics
- Unified search across bots, leads, KB
- Multi-language support
