# Repository Guidelines

## Project Structure & Module Organization
- `App.tsx`, `index.tsx`, and `index.html` in the repo root are the Vite entry points.
- `components/` holds UI views by feature (for example, `components/BotBuilder/`).
- `hooks/` stores React hooks; `services/` contains API/AI helpers; `shared/` defines database schema and shared models (see `shared/schema.ts`).
- `server/` is the Express API and Stripe integration (`server/index.ts`, `server/webhookHandlers.ts`).
- `public/` hosts static assets; `src/index.css` is the Tailwind/global stylesheet.
- `scripts/` contains one-off Node scripts (for example, `scripts/createStripePlans.js`); `dist/` is build output; `uploads/` is runtime data.
- `test/` contains all test files organized by type (services, server, middleware, integration, e2e, components).

## Build, Lint, and Test Commands

### Development Commands
- `npm run dev` - Starts the Vite client and the API server together
- `npm run client` - Runs only the Vite dev server
- `npm run server` - Runs the Express API with `tsx`
- `npm run build` - Type-checks with `tsc` and builds the client
- `npm run preview` - Serves the production build locally

### Linting Commands
- `npm run lint` - Runs Biome checks for formatting and linting
- `npm run lint -- --write` - Auto-fixes fixable linting issues

### Database Commands
- `npm run db:push` - Syncs schema via Drizzle
- `npm run db:studio` - Opens Drizzle Studio
- `npm run db:migrate` - Runs database migrations
- `npm run db:migrate:status` - Checks migration status
- `npm run db:migrate:up` - Runs migrations up
- `npm run db:migrate:down` - Runs migrations down
- `npm run db:seed` - Seeds database with test data
- `npm run db:setup` - Runs migrations and seeds the database
- `npm run db:reset` - Resets the database (drops tables, runs migrations, seeds)

### Testing Commands
- `npm run test` - Runs Vitest in watch mode (interactive)
- `npm run test:ui` - Runs Vitest with UI interface
- `npm run test:run` - Runs all tests once (no watch)
- `npm run test:coverage` - Runs all tests with coverage report
- `npm run test:run -- <file-path>` - Runs a single test file
  - Example: `npm run test:run -- test/services/webScraperService.test.ts`
- `npm run test:run -- -t "<test-name>"` - Runs tests with matching name
  - Example: `npm run test:run -- -t "extracts readable text"`
- `npm run test:run -- --run --no-watch` - Runs all tests without watch mode

## Coding Style & Naming Conventions

### TypeScript & React
- TypeScript + React with strict mode (`tsconfig.json`); use `.tsx` for components
- Indentation is 2 spaces and semicolons are used consistently
- Component folders and component names use PascalCase (e.g., `components/Marketing/MarketingTools.tsx`)
- Hooks follow the `useX` pattern in `hooks/`; shared types live in `types.ts` and `shared/`
- Use Biome for formatting and linting (`biome.json` in the repo root); run `npm run lint` before pushing

### Imports
- Use absolute imports with `@/` alias (configured in `tsconfig.json`)
- Organize imports into groups:
  1. External dependencies (React, third-party libraries)
  2. Internal components/hooks
  3. Services/API calls
  4. Types/interfaces
  5. Styles

### Formatting Rules (Biome)
- Quote style: Single quotes
- Semicolons: Always
- Indentation: 2 spaces
- Organize imports: Enabled (Biome will auto-sort)
- Trailing commas: Recommended for multi-line statements

### Type Safety
- Prefer explicit interfaces over type aliases for clarity
- Avoid `any` type; use `unknown` instead with proper type guards
- Validate external inputs before use with Zod schemas
- Use TypeScript to enforce legally sound data structures
- Enable strict mode in `tsconfig.json`

### Error Handling
- Use try-catch blocks for async operations
- Create meaningful error messages that include context
- Log errors with Winston logger (server-side)
- Handle client-side errors with user-friendly messages
- Use Zod validation errors for input validation

### Naming Conventions
- Variables/functions: camelCase (e.g., `handleSubmit`, `userData`)
- Components/Hooks: PascalCase (e.g., `UserProfile`, `useAuth`)
- Constants: UPPER_SNAKE_CASE (e.g., `API_ENDPOINTS`, `MAX_FILE_SIZE`)
- Interfaces/Types: PascalCase (e.g., `User`, `ProductConfig`)
- Files/Folders: PascalCase for components, kebab-case for utilities

### Architectural Principles
- Follow Airbnb JavaScript Style Guide principles: clear module boundaries, descriptive naming, minimal side effects
- Separate concerns: UI components, business logic, API calls, state management
- Use React hooks for state and side effects
- Server-side: Use Express with TypeScript, Drizzle ORM for database
- Client-side: Use React with TypeScript, Tailwind CSS for styling

## Testing Guidelines

### Test Framework
- Vitest is the testing framework (configured in `vitest.config.ts`)
- React Testing Library for component tests
- jsdom environment for DOM simulation
- Setup file: `test/setup.ts` - configures mocks and environment variables

### Test Structure
- Test files are located in `test/` directory
- Organized by type:
  - `services/` - Unit tests for business logic
  - `server/` - Tests for server-side functionality
  - `middleware/` - Tests for Express middleware
  - `integration/` - Integration tests for API endpoints
  - `e2e/` - End-to-end user flow tests
  - `components/` - React component tests

### Test Naming
- Filename: `<feature>.test.ts` or `<Component>.test.tsx`
- Test blocks: `describe('Feature', () => {})`
- Test cases: `it('should do something', () => {})`
- Use meaningful descriptions that follow the "should" pattern

### Test Writing Tips
- Mock external dependencies (e.g., OpenAI, database) using Vitest mocks
- Use `vi.mock()` to mock modules
- Test both success and failure scenarios
- Keep tests isolated and independent
- Use `expect` for assertions

## Commit & Pull Request Guidelines
- Git history contains only `Initial commit`; no commit convention is established
- Recommended: short imperative subject (e.g., `Add billing webhook validation`) and details in the body if needed
- PRs should include a concise description, linked issues, and screenshots/GIFs for UI changes; call out env/config changes

## Security & Configuration Tips
- Use `.env.example` as the baseline for required environment variables; never commit secrets
- Stripe setup steps live in `STRIPE_SETUP_GUIDE.md`
- When touching database schema, update `shared/schema.ts` and re-run `npm run db:push`
- Billing requires `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WHITELABEL_PRICE_ID`, and `APP_BASE_URL` for redirects/webhooks
