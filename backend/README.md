# Cangyun Backend (NestJS)

NestJS 11 service that powers the Cangyun 分山劲 RAG agent. It exposes chat endpoints, knowledge ingestion APIs, and an AI provider abstraction layered over OpenAI (extensible to future vendors).

## Key Modules

- `config` – zod-validated env loader with `.env.local` support and typed accessors.
- `database` – PostgreSQL connection pool (pgvector enabled) shared across repositories.
- `ai` – Provider-agnostic facade implemented with the Vercel AI SDK for chat + embeddings.
- `knowledge` – Ingestion and retrieval services backed by `knowledge_documents` and `knowledge_chunks` tables.
- `chat` – SSE endpoint (`POST /api/v1/chat`) that orchestrates retrieval and streams assistant responses with source metadata.

## Prerequisites

- PostgreSQL 15+ with `pgvector` extension.
- Environment variables (see root `.env.example`): `DATABASE_URL`, `OPENAI_API_KEY`, `YUQUE_TOKEN`, etc.
- Run `backend/migrations/0001_init.sql` to create the knowledge schema before serving requests.

## Development

```bash
# Install workspace dependencies and build shared packages from repo root
pnpm install
pnpm run build:common

# Spin up infrastructure (optional)
docker compose up -d postgres redis

# Start the backend in watch mode
pnpm run dev:backend  # alias for pnpm --filter cangyun-backend run dev

# Run linting, type checks, and tests
pnpm --filter cangyun-backend run lint
pnpm --filter cangyun-backend run test
pnpm --filter cangyun-backend run test:cov
```

## Core Endpoints

| Method | Path                          | Description                                                                        |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------- |
| `POST` | `/api/v1/knowledge/documents` | Upsert a document and chunk payload; optional embedding generation.                |
| `GET`  | `/api/v1/knowledge/documents` | List indexed documents (id, title, metadata).                                      |
| `POST` | `/api/v1/chat`                | Streams assistant responses via SSE; returns citation metadata first, then deltas. |

The knowledge search combines pgvector similarity with pg full-text ranking. When embedding generation fails, the service falls back to lexical ranking and logs a warning.

## Ingestion Workflow

- Use `scripts/knowledge/ingest-yuque.ts` from the repo root to scrape Yuque 公共页面并生成 Markdown（基于 Playwright，图片/Canvas 会额外截屏写入 `tmp/knowledge/images`，可通过 `YUQUE_OCR` 控制是否执行 Tesseract OCR）。
- After review, POST the markdown content to `/api/v1/knowledge/documents` via your own tooling or extend the script to call the API.
- Set `KNOWLEDGE_GENERATE_EMBEDDINGS=true` when ingesting via the API to request embedding generation (requires OpenAI credentials).

## Architecture Notes

- Controllers remain thin and offload logic to services (Domain-first).
- Module providers are registered via tokens for future swaps (e.g., move to Pinecone).
- All DTO payloads use zod schemas; invalid requests return 400 with details.

For a full system overview, see `docs/rfc-001-architecture-design.md` and the active timeline in `docs/development-plan.md`.
