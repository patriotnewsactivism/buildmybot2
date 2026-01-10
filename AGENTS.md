# Repository Guidelines

## Project Structure & Module Organization
- `App.tsx`, `index.tsx`, and `index.html` in the repo root are the Vite entry points.
- `components/` holds UI views by feature (for example, `components/BotBuilder/`).
- `hooks/` stores React hooks; `services/` contains API/AI helpers; `shared/` defines database schema and shared models (see `shared/schema.ts`).
- `server/` is the Express API and Stripe integration (`server/index.ts`, `server/webhookHandlers.ts`).
- `public/` hosts static assets; `src/index.css` is the Tailwind/global stylesheet.
- `scripts/` contains one-off Node scripts (for example, `scripts/createStripePlans.js`); `dist/` is build output; `uploads/` is runtime data.

## Build, Test, and Development Commands
- `npm run dev` starts the Vite client and the API server together.
- `npm run client` runs only the Vite dev server.
- `npm run server` runs the Express API with `tsx`.
- `npm run build` type-checks with `tsc` and builds the client.
- `npm run lint` runs Biome checks for formatting and linting.
- `npm run preview` serves the production build locally.
- `npm run db:push` syncs schema via Drizzle; `npm run db:studio` opens Drizzle Studio.

## Coding Style & Naming Conventions
- TypeScript + React with strict mode (`tsconfig.json`); use `.tsx` for components.
- Indentation is 2 spaces and semicolons are used consistently.
- Component folders and component names use PascalCase (for example, `components/Marketing/MarketingTools.tsx`).
- Hooks follow the `useX` pattern in `hooks/`; shared types live in `types.ts` and `shared/`.
- Use Biome for formatting and linting (`biome.json` in the repo root); run `npm run lint` before pushing.
- For architectural naming and logic, follow Airbnb JavaScript Style Guide principles: clear module boundaries, descriptive naming, and minimal side effects.
- Use TypeScript to enforce legally sound data structures: prefer explicit interfaces, avoid `any`, and validate external inputs before use.

## Testing Guidelines
- No automated test framework is configured yet (no Jest/Vitest scripts).
- If you add tests, document the runner and use `*.test.ts(x)` naming alongside code or in a `tests/` folder.

## Commit & Pull Request Guidelines
- Git history contains only `Initial commit`; no commit convention is established.
- Recommended: short imperative subject (for example, `Add billing webhook validation`) and details in the body if needed.
- PRs should include a concise description, linked issues, and screenshots/GIFs for UI changes; call out env/config changes.

## Security & Configuration Tips
- Use `.env.example` as the baseline for required environment variables; never commit secrets.
- Stripe setup steps live in `STRIPE_SETUP_GUIDE.md`.
- When touching database schema, update `shared/schema.ts` and re-run `npm run db:push`.
- Billing requires `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WHITELABEL_PRICE_ID`, and `APP_BASE_URL` for redirects/webhooks.
