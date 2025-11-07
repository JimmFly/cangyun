# Cangyun Backend (NestJS)

NestJS 11 service that powers the Cangyun 分山劲 RAG agent. It exposes chat endpoints, knowledge ingestion APIs, and an AI provider abstraction layered over OpenAI (extensible to future vendors).

## Key Modules

- `config` – zod-validated env loader with `.env.local` support and typed accessors.
- `database` – PostgreSQL connection pool (pgvector enabled) shared across repositories.
- `ai` – Provider-agnostic facade implemented with the Vercel AI SDK for chat + embeddings.
- `knowledge` – Ingestion and retrieval services backed by `knowledge_documents` and `knowledge_chunks` tables.
- `guide` – 当前赛季白皮书查询与摘要服务，通过 Perplexity 定位 `GUIDE_BASE_URL` 下的最新攻略。
- `chat` – SSE endpoint (`POST /api/v1/chat`) that orchestrates retrieval and streams assistant responses with source metadata.
- `cangyun` – Perplexity 驱动的语雀苍云站内搜索与正文抓取工具，供聊天模型按需调用。

## Prerequisites

- PostgreSQL 15+ with `pgvector` extension.
- Environment variables (see root `.env.example`): `DATABASE_URL`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `GUIDE_BASE_URL`, `GUIDE_WHITEPAPER_KEYWORDS` (optional), `YUQUE_TOKEN`, etc.
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

| Method | Path                          | Description                                                                                                                                                                                                 |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/knowledge/documents` | Upsert a document and chunk payload; optional embedding generation.                                                                                                                                         |
| `GET`  | `/api/v1/knowledge/documents` | List indexed documents (id, title, metadata).                                                                                                                                                               |
| `POST` | `/api/v1/chat`                | Streams assistant responses via SSE；自动暴露 `cangyun_search` / `cangyun_fetch_page` / `fetch_current_season_guide` 工具，并在 sources 事件里返回引用（若配置 `GUIDE_BASE_URL`，会附带当前赛季白皮书链接） |

The knowledge search combines pgvector similarity with pg full-text ranking. When embedding generation fails, the service falls back to lexical ranking and logs a warning.

启用 `PERPLEXITY_API_KEY` 后，聊天流程会在知识库不足时使用 Perplexity 搜索语雀苍云空间，并可调用 `cangyun_fetch_page` 抓取正文供模型核实与引用。

## Guide & External Search

- `GuideService` 依赖 `GUIDE_BASE_URL` + `GUIDE_WHITEPAPER_KEYWORDS` + `PERPLEXITY_API_KEY`，通过 Perplexity 将搜索范围限制在攻略站域名下，并返回最新赛季白皮书链接与正文摘要。未配置 API Key 时，该工具自动禁用。
- `CangyunSearchService` 内置域名/路径白名单（语雀苍云空间、剑三魔盒、每日攻略），最多返回 10 条候选并缓存 30 分钟；`cangyun_fetch_page` 会抓取命中页面正文（去除脚本/样式）并限制在 8k 字符以内。
- 两个工具都会在成功响应时通过 `registerSource` 将引用注入 SSE `sources` 事件，前端引用面板无需额外查询即可展示外部文档。

## Ingestion Workflow

- Use `scripts/knowledge/ingest-yuque.ts` from the repo root to scrape Yuque 公共页面并生成 Markdown（基于 Playwright，图片/Canvas 会额外截屏写入 `tmp/knowledge/images`，可通过 `YUQUE_OCR` 控制是否执行 Tesseract OCR）。
- Run `pnpm run ingest:markdown` to parse the exported Markdown, normalize headings/frontmatter, chunk content, and call `/api/v1/knowledge/documents` with `generateEmbeddings=true`（传递 `--no-embeddings` 可跳过向量生成）。
- 直接调用 API 时，同样可以通过请求体上的 `generateEmbeddings` 字段请求或跳过向量生成；OpenAI 凭证会在服务器端使用。

## Architecture Notes

- Controllers remain thin and offload logic to services (Domain-first).
- Module providers are registered via tokens for future swaps (e.g., move to Pinecone).
- All DTO payloads use zod schemas; invalid requests return 400 with details.

For a full system overview, see `docs/rfc-001-architecture-design.md` and the active timeline in `docs/development-plan.md`.
