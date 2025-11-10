# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Cangyun is a multi-modal RAG platform for the JX3 Cangyun (分山劲) playbook. It's a pnpm monorepo with:

- **Backend**: NestJS 11 API with multi-agent RAG architecture
- **Frontend**: React 19 + Vite web application with AI UI primitives
- **Shared packages**: `@cangyun-ai/*` packages for UI, hooks, types, router, etc.
- **Knowledge scripts**: Yuque ingestion with Playwright + OCR

## Essential Commands

### Development

```bash
# Initial setup
corepack enable
pnpm install
pnpm run build:common          # MUST build shared packages first

# Start development servers
pnpm run dev                   # Both backend + web with prefixed logs
pnpm run dev:backend           # Backend only (NestJS with watch mode)
pnpm run dev:web               # Frontend only (Vite dev server)

# Scope to specific workspace
pnpm --filter <workspace> run <command>
```

### Testing & Quality

```bash
# Full quality check (lint → typecheck → test)
pnpm run check

# Individual checks
pnpm run lint                  # ESLint + Prettier
pnpm run lint:fix              # Auto-fix linting issues
pnpm run typecheck             # TypeScript project references
pnpm run test                  # Backend Jest tests

# Backend-specific tests
pnpm --filter cangyun-backend run test
pnpm --filter cangyun-backend run test:watch
pnpm --filter cangyun-backend run test:cov
```

### Building

```bash
pnpm run build                 # Build all: shared packages → web → backend
pnpm run build:common          # Build only @cangyun-ai/* packages
```

### Knowledge Ingestion

```bash
# Scrape Yuque documentation (requires YUQUE_TOKEN)
pnpm run ingest:yuque          # Output: tmp/knowledge/*.md + images/

# Process markdown into knowledge base (requires backend running)
pnpm run ingest:markdown       # POSTs to /api/v1/knowledge/documents
```

## Architecture

### Backend Multi-Agent RAG System

The backend (`backend/src/`) implements a sophisticated multi-agent architecture:

1. **Parallel Search Phase**:
   - `KnowledgeAgentService`: Searches local knowledge base using pgvector (OpenAI embeddings)
   - `ExternalAgentService`: Performs domain-constrained web search via Perplexity API
   - Both agents run concurrently for optimal latency

2. **Coordination Phase**:
   - `CoordinatorAgentService`: Synthesizes results from both agents using OpenAI
   - Streams responses as SSE with `delta` (text), `sources` (citations), and `status` (agent progress) events

3. **Key Modules**:
   - `chat/`: Multi-agent orchestration, SSE streaming, resumable chat
   - `knowledge/`: Document upsert, pgvector search with lexical fallback
   - `ai/`: AI provider abstraction (OpenAI for chat/embeddings, Perplexity for search)
   - `cangyun/`: Domain-whitelisted Perplexity search with 30min cache
   - `guide/`: Season whitepaper discovery with multiple fallback strategies
   - `database/`: PostgreSQL pool with pgvector extension
   - `config/`: Zod-validated environment configuration

### Frontend Custom SSE Transport

The web app (`apps/web/src/`) uses a custom `CustomChatTransport` to:

- Parse backend SSE events: `delta`, `sources`, `status`, `error`
- Handle resumable streaming on network interruptions
- Support stream interruption via abort signal
- Display real-time agent progress with ChainOfThought UI component

Key frontend features in `apps/web/src/features/chat/`:

- `ChatRoute.tsx`: Main chat interface with message history
- `custom-chat-transport.ts`: SSE event parser for Vercel AI SDK
- Dynamic `topK` selection for retrieval control
- Citation grouping with local/external source tags
- Agent progress timeline visualization

### Shared Packages

Internal `@cangyun-ai/*` packages in `apps/common/`:

- `types`: Shared TypeScript types (ChatSource, ChatAgentStatus, etc.)
- `ui`: Reusable UI components with Radix UI + Tailwind
- `hooks`: React hooks for common patterns
- `router`: Routing utilities
- `config`: Shared configuration
- `utils`: Utility functions

**Important**: Always run `pnpm run build:common` before developing after pulling changes to shared packages.

## Database Setup

```bash
# Start PostgreSQL via Docker (recommended)
docker compose up -d postgres

# Apply schema with pgvector extension
psql $DATABASE_URL -f backend/migrations/0001_init.sql

# Clear knowledge data if needed
psql $DATABASE_URL -f backend/migrations/clear_knowledge_tables.sql
```

### Schema Overview

- `knowledge_documents`: Document metadata with external_id, title, source_url
- `knowledge_chunks`: Text chunks with 3072-dim embeddings (text-embedding-3-large)
- Note: 3072-dim vectors exceed pgvector's 2000-dim index limit, so queries use sequential scan

## Environment Configuration

Copy `.env.example` to `.env.local` and configure:

**Required**:

- `DATABASE_URL`: PostgreSQL connection string
- `OPENAI_API_KEY`: For chat and embeddings
- `PERPLEXITY_API_KEY`: For external web search

**Optional**:

- `YUQUE_TOKEN`, `YUQUE_SPACE`: For knowledge ingestion
- `REDIS_URL`: For caching (defaults to in-memory)
- `S3_*`: For S3-compatible storage
- `GUIDE_BASE_URL`, `GUIDE_WHITEPAPER_KEYWORDS`: For guide search
- `NODE_ENV=development`: Enables verbose logging

The backend uses Zod validation (`backend/src/config/env.validation.ts`) and will abort startup if required variables are missing.

## Development Workflow

### Adding New Features

1. **Backend**:
   - Create new module in `backend/src/<feature>/`
   - Register in `app.module.ts`
   - Add service/controller with proper dependency injection
   - Write tests in `*.spec.ts` alongside source files
   - Update `backend/README.md` if adding new API endpoints

2. **Frontend**:
   - Add components in `apps/web/src/components/` or feature-specific folders
   - Use shared `@cangyun-ai/*` packages for common functionality
   - Colocate feature code in `apps/web/src/features/<feature>/`
   - Import AI SDK hooks from `@ai-sdk/react` for chat UI

3. **Shared Packages**:
   - Modify packages in `apps/common/<package>/`
   - Run `pnpm run build:common` to rebuild
   - Ensure dependent workspaces reload changes

### Knowledge Ingestion Pipeline

1. **Scrape Yuque** (`pnpm run ingest:yuque`):
   - Uses Playwright to navigate Yuque documentation
   - Captures canvas table screenshots for OCR (optional with `YUQUE_OCR=true`)
   - Parses sheet data from XHR responses
   - Outputs normalized Markdown to `tmp/knowledge/`

2. **Process Markdown** (`pnpm run ingest:markdown`):
   - Reads files from `tmp/knowledge/`
   - Normalizes headings/lists, chunks by section/paragraph (~1.8k tokens)
   - POSTs to `/api/v1/knowledge/documents` with optional embedding generation
   - Backend stores chunks in PostgreSQL with pgvector embeddings

3. **Verification**:
   ```bash
   curl http://localhost:3000/api/v1/knowledge/documents | jq
   ```

## Code Style

- **TypeScript**: Strict mode, no `any` types (reference TypeScript best practices)
- **React**: Follow [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
  - Derive data within render
  - Use event handlers for mutations
  - Only use `useEffect` for external system synchronization
- **Formatting**: Prettier with 2-space indentation, single quotes
- **Imports**: Use `@cangyun-ai/*` aliases for shared packages, not relative paths
- **Naming**:
  - PascalCase for React components and classes
  - camelCase for functions and variables
  - kebab-case for shared package directories

## Testing

- **Backend**: Jest with `NODE_OPTIONS=--experimental-vm-modules` for ESM support
  - Place `*.spec.ts` files alongside source
  - Coverage reports in `backend/coverage/`
  - Aim to maintain or improve coverage on changes
- **Frontend**: Component tests with Vitest/Testing Library (future)
- **Pre-commit**: Husky + lint-staged runs formatting on staged files

## Debugging

- Set `NODE_ENV=development` for verbose backend logs:
  - Perplexity API responses
  - Vector search hit counts
  - Embedding fallback warnings
  - SSE stream error details
- **Network issues**: Watch for `ChatStreamError` logs; frontend auto-resumes
- **Port conflicts**: After testing, kill any background processes occupying ports

## Important Notes

1. **Shared packages first**: Always `pnpm run build:common` after `pnpm install` or when pulling changes to `apps/common/*`
2. **Database migrations**: Apply SQL files in `backend/migrations/` manually with `psql`
3. **Streaming architecture**: The chat endpoint uses SSE; ensure proxies/load balancers don't buffer responses
4. **Vector dimensions**: Current embedding model (text-embedding-3-large) produces 3072-dim vectors which exceed pgvector's index limit; queries work but use sequential scan
5. **Domain whitelisting**: External search is constrained to Yuque/JX3Box/Xoyo domains via `CangyunSearchService`
6. **Resume capability**: Chat streams are resumable up to 2 retries on network failures via `guardStream` helper

## Conventional Commits

Follow these prefixes seen in git history:

- `feat:` - New features
- `fix:` - Bug fixes
- `chore:` - Maintenance tasks
- `docs:` - Documentation updates
- `refactor:` - Code refactoring

## Additional Resources

- `README.md`: Project overview and quick start
- `backend/README.md`: Backend architecture and API details
- `AGENTS.md`: Detailed development guidelines and best practices
- `docs/development-plan.md`: Current roadmap and delivery timeline
- `docs/rfc-001-architecture-design.md`: System architecture RFC
- `docs/Multi-Modal-RAG-Agent-dev-document.md`: Multi-modal design specifications
