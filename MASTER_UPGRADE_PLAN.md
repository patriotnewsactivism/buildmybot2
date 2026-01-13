# BuildMyBot.app - Master Upgrade Plan

This document tracks the implementation of 10 high-impact features to elevate the platform to an enterprise-grade solution.

## 🧠 Phase 1: Core Intelligence (Vector Search)
- [ ] **Database:** Add `embedding` column (vector type) to `knowledgeChunks` table.
- [ ] **Backend:** Create `EmbeddingService` using OpenAI `text-embedding-3-small`.
- [ ] **Ingestion:** Update `DocumentProcessor` to generate embeddings for new chunks.
- [ ] **Search:** Update `KnowledgeService` to use Cosine Similarity for semantic retrieval.

## 🎨 Phase 2: Visual & UX Upgrades
- [ ] **Voice Agent:** Add real-time audio waveform visualizer to `PhoneAgent` component.
- [ ] **Dashboard:** Redesign main dashboard with **Bento Grid** layout.
- [ ] **Theming:** Implement system-wide **Dark Mode** and custom theme support.

## 🔧 Phase 3: Infrastructure & Scalability
- [ ] **Queues:** Implement **Background Job Queue** (BullMQ/Redis) for scraping/processing.
- [ ] **Caching:** Implement **Redis Caching** for sessions and frequent DB queries.
- [ ] **Testing:** Fix `vitest` setup and add E2E tests (Playwright).

## 🚀 Phase 4: Advanced Features
- [ ] **Human Handoff:** Create "Live Inbox" for agent takeover.
- [ ] **Visual Builder:** Implement Drag-and-Drop flow builder.
- [ ] **Omnichannel:** Integrate Twilio SMS/WhatsApp and Instagram Direct.

---

**Status:** initialized
**Current Focus:** Phase 1 (Vector Search) & Phase 2 (Voice Waveform)
