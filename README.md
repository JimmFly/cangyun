# Cangyun Monorepo

Cangyun 是面向《剑网三》苍云“分山劲”心法的多模态战术平台。该仓库承载全部工程资产：React 客户端、NestJS 编排服务、公共 TypeScript 包，以及与 Yuque 攻略站联动的知识脚本。项目以检索增强生成（RAG）为骨架，分阶段交付文字问答、图像循环识别与视频战斗分析能力，帮助 PVE 玩家在实战中快速掌握最优循环与配置策略。

## What's Inside

- `apps/web` – React 19 + Tailwind 控制台，提供分山劲知识问答、引用展示与未来多模态入口。
- `backend` – NestJS 11 服务层，负责知识入库、检索调度、AI 调用与 SSE 推送。
- `apps/common/*` – 业务 UI、hooks、配置等共享模块，以 `@cangyun-ai/*` 形式维护。
- `scripts/knowledge/ingest-yuque.ts` – Yuque 攻略同步脚本，输出结构化 Markdown + 元数据，供知识库 ingest。

## Prerequisites

- Node.js ≥ 18 (`corepack enable` to pin pnpm).
- pnpm 10 (defined in `packageManager` field).
- PostgreSQL 15+ with the `pgvector` extension enabled.
- Redis (optional for future caching/rate limiting).
- Yuque API token (for data ingestion).

## Setup

### First-Time Setup Checklist

1. **Node & pnpm** – Install Node.js ≥ 18 and run `corepack enable` to pin pnpm 10 (the workspace relies on the `packageManager` field).
2. **Install dependencies** – Run `pnpm run setup` (equivalent to `pnpm install && pnpm run build:common`) to bootstrap all shared packages.
3. **Environment variables** – Copy `.env.example` to `.env.local`, then provide credentials for OpenAI (`OPENAI_API_KEY`), Postgres (`DATABASE_URL`), and optional Redis/Yuque settings.
4. **Local services** – `docker compose up -d` starts Postgres + Redis with the expected ports. Update the env file to match (`postgresql://postgres:postgres@localhost:5432/cangyun`, etc.).
5. **Optional Playwright step** – Before running the Yuque ingestion script for the first time, execute `pnpm exec playwright install chromium`.
6. **Smoke checks** – `pnpm run lint`, `pnpm run typecheck`, and `pnpm run test` ensure the repo is healthy before coding.
7. **Start developing** – `pnpm run dev` launches backend + web with prefixed logs. Use `pnpm run dev:web` or `pnpm run dev:backend` when you only need one side.

```bash
# Clone and copy environment defaults
cp .env.example .env.local

# Optionally start Postgres + Redis locally
docker compose up -d

# Install every workspace dependency and build shared packages
pnpm install
pnpm run build:common

# Apply database schema
psql $DATABASE_URL -f backend/migrations/0001_init.sql
```

Update `.env.local` with OpenAI, Yuque, Postgres, and optional storage credentials before starting services.

If you use the provided `docker-compose.yml`, set `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cangyun` and `REDIS_URL=redis://localhost:6379`.

## Local Development

```bash
# Launch backend + web together (parallel via pnpm filters)
pnpm run dev

# Run each stack independently
pnpm run dev:backend
pnpm run dev:web
```

### Knowledge Base Ingestion

```bash
# Install browsers (once) for Playwright + enable OCR output
pnpm exec playwright install chromium

# Export Yuque content to Markdown under tmp/knowledge
YUQUE_SPACE=sgyxy/cangyun pnpm run ingest:yuque
```

Optionally set `YUQUE_DOC_URLS` (comma separated) to scrape specific documents, or define variables in `.env.local`. The script saves Markdown files and no longer calls the ingestion API directly.
Set `YUQUE_OCR=false` to skip the (slower) Tesseract OCR step; adjust `YUQUE_OCR_LANG` if you need other languages. Screenshots and OCR output are stored under `tmp/knowledge/images`.
If discovery misses docs, tweak `YUQUE_MAX_DOCS` / `YUQUE_SCROLL_ATTEMPTS` to control how many times the scraper scrolls or clicks “加载更多”.

## Useful Scripts

| Command              | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `pnpm run lint`      | ESLint + Prettier checks across the monorepo.          |
| `pnpm run typecheck` | TypeScript project references build (`tsconfig.json`). |
| `pnpm run test`      | Jest suite for the backend.                            |
| `pnpm run check`     | Convenience alias for lint → typecheck → test.         |
| `pnpm run build`     | Builds shared packages, web app, and backend in order. |

Git hooks (Husky + lint-staged) run automatically on commit to keep formatting and linting aligned.

## Product Roadmap

- **Phase 1 · 文字 RAG MVP**：攻略知识入库、向量检索、流式问答、引用追溯。目前已上线，并作为 Chat 体验的默认能力。
- **Phase 2 · 图像识别与循环统计**：结合 OCR、技能模板和循环评分，对战斗截图生成结构化诊断与建议。
- **Phase 3 · 视频分析与报告**：打通上传、抽帧、事件识别与时间轴报告，输出可分享的分山劲战斗回顾。

详细规划及里程碑请参阅 `docs/development-plan.md` 与 `docs/Multi-Modal-RAG-Agent-dev-document.md`。

## Who We Serve

- **PVE 新手玩家**：快速理解技能机制与基础循环，搭建稳定输出节奏。
- **进阶输出手**：针对循环瓶颈获取占比分析、知识引用与改进建议。
- **团队指挥**：随时查询攻略依据、配置建议与战斗表现，支撑团队战术决策。

## Current Limitations

- `技能系数汇总` 查询暂未实现，缺少可靠的数据源和解析流程；待后续版本接入。

## Documentation

- [Development Plan](./docs/development-plan.md) – Current roadmap and milestone notes.
- [Multi-Modal RAG Agent 基准文档](./docs/Multi-Modal-RAG-Agent-dev-document.md) – Product + technical background.
- [RFC-001 架构设计](./docs/rfc-001-architecture-design.md) – End-to-end system architecture.
- [RFC-001 开发任务清单](./docs/rfc-001-dev-task.md) – Phase breakdown of required work.

Refer to `AGENTS.md` for contributor guidelines and engineering conventions (React effects, schema usage, etc.).
