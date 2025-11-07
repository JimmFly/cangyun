# Cangyun Monorepo

> **CN**：面向《剑网三》苍云“分山劲”心法的多模态 RAG 平台，包含 React 19 Web 客户端、NestJS 11 API、共享 UI/工具包与语雀知识摄取脚本。
>
> **EN**: Multi-modal RAG workspace for the JX3 Cangyun (Fenshanjin) playbook, bundling a React 19 web console, a NestJS 11 API, shared UI/util packages, and Yuque ingestion scripts.

## 项目概览 · Project Overview

- **CN**：后端通过多 Agent（知识库、外部搜索、协调）并行搜索，再用 OpenAI 生成答案，并以 SSE 推送引用与 Agent 状态；前端的 `ChatRoute` 使用自定义 `CustomChatTransport` 解析 `sources/delta/status` 事件，支持 topK 调整、引用抽屉、流式中断。
- **EN**: The backend runs Knowledge/External/Coordinator agents in parallel, merges the hits, and streams answers plus references/status over SSE. The React `ChatRoute` consumes the custom `CustomChatTransport`, exposing topK controls, citation drawers, and interruptible streaming.

## 仓库结构 · Repository Layout

| 路径 / Path         | 描述 / Description                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | **CN**：React 19 + Vite + Tailwind 前端，含首页、Chat、AI UI primitives。<br/>**EN**: React 19 + Vite + Tailwind app with the landing page, chat route, and AI UI primitives.            |
| `apps/common/*`     | **CN**：`@cangyun-ai/*` 共享包（UI、配置、hooks、router 等）。<br/>**EN**: Shared packages published as `@cangyun-ai/*` (UI kit, hooks, router, configs).                                |
| `backend`           | **CN**：NestJS API，模块包括 `chat`、`knowledge`、`guide`、`cangyun`、`ai` 等。<br/>**EN**: NestJS API hosting chat/knowledge/guide/cangyun/ai modules.                                  |
| `scripts/knowledge` | **CN**：`ingest-yuque.ts`（Playwright+OCR 抓取）与 `ingest-markdown.ts`（切 chunk + 上传）。<br/>**EN**: Yuque scraping & Markdown ingestion scripts (Playwright + OCR, chunk + upload). |
| `docs/`             | **CN**：路线图、架构 RFC、任务清单、多模态设计文档。<br/>**EN**: Roadmap, architecture RFCs, task tracker, and multi-modal design notes.                                                 |

## 核心特性 · Key Capabilities

1. **CN**：多 Agent Chat（知识库向量检索 + Perplexity 搜索 + 协调生成），支持流式续写、Agent 状态事件、自适应查询增强。<br/>**EN**: Multi-agent chat (vector search + Perplexity search + coordinator) with resumable streaming, agent-status events, and query rewriting.
2. **CN**：pgvector + Full Text 复合检索；当嵌入失败时自动降级为词法搜索并记录日志。<br/>**EN**: pgvector + full-text hybrid retrieval with graceful fallback and logging.
3. **CN**：语雀抓取脚本支持 Canvas 表格截图、可选 Tesseract OCR、多源 sheet 数据解析；Markdown 导入器会规范标题/列表并批量调用 `/api/v1/knowledge/documents`。<br/>**EN**: Yuque ingestion captures canvas tables, optional Tesseract OCR, sheet payload parsing, and the Markdown importer normalizes headings/lists before batching `/api/v1/knowledge/documents` requests.
4. **CN**：`CangyunSearchService` 将 Perplexity 搜索限定在语雀苍云/剑三魔盒/每日攻略域，带 30min 缓存与优先级排序；`GuideService` 额外提供当前赛季白皮书定位。<br/>**EN**: `CangyunSearchService` constrains Perplexity to Yuque/JX3Box/Xoyo domains with 30‑minute caching and priority scoring; `GuideService` surfaces current-season whitepapers.
5. **CN**：前端 Chat UI 提供引用分组、来源标签（本地/网络）、Agent 进度链路、消息复制/重试、topK 动态切换、SSE 停止按钮。<br/>**EN**: The chat UI ships citation grouping, local/external tags, an agent progress timeline, copy/regenerate actions, dynamic topK selection, and a stop button.

## 环境要求 · Prerequisites

- **CN**：Node.js ≥ 18（`corepack enable` 以锁定 pnpm 10）、PostgreSQL 15+（启用 `pgvector`）、可选 Redis、Yuque Token、Perplexity API Key；Docker Compose 可启动本地 Postgres/Redis。<br/>**EN**: Node.js ≥ 18 (use `corepack enable` for pnpm 10), PostgreSQL 15+ with `pgvector`, optional Redis, Yuque token, and Perplexity API key; Docker Compose spins up Postgres/Redis locally.

## 快速开始 · Quick Start

1. **CN**：复制环境变量并安装依赖
   ```bash
   cp .env.example .env.local
   corepack enable
   pnpm install
   pnpm run build:common
   ```
   **EN**: Clone env vars, enable corepack, install deps, and build shared packages.
2. **CN**：启动基础设施（可选）并应用数据库 schema
   ```bash
   docker compose up -d
   psql $DATABASE_URL -f backend/migrations/0001_init.sql
   ```
   **EN**: Bring up infra via Docker Compose and apply the initial schema.
3. **CN**：运行健康检查命令确保工作区干净
   ```bash
   pnpm run lint
   pnpm run typecheck
   pnpm run test
   ```
   **EN**: Run lint/typecheck/test to verify the workspace.
4. **CN**：开发模式
   ```bash
   pnpm run dev          # backend + web 并行
   pnpm run dev:backend  # 仅 NestJS
   pnpm run dev:web      # 仅 React
   ```
   **EN**: Launch both stacks or scope to backend/web only.

## 常用脚本 · Workspace Commands

| 命令 / Command             | 作用 / Purpose                                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run build`           | **CN**：构建共享包 → web → backend。<br/>**EN**: Build shared packages, the web app, then the backend.                                                                                                                                         |
| `pnpm run check`           | **CN**：顺序执行 lint + typecheck + test。<br/>**EN**: Runs lint, typecheck, and backend tests sequentially.                                                                                                                                   |
| `pnpm run ingest:yuque`    | **CN**：使用 Playwright 抓取语雀，支持 `YUQUE_DOC_URLS`、OCR、Canvas 截图。<br/>**EN**: Scrapes Yuque via Playwright with optional `YUQUE_DOC_URLS`, OCR, and canvas screenshots.                                                              |
| `pnpm run ingest:markdown` | **CN**：规范 Markdown、分块、调用 `/api/v1/knowledge/documents`（可传 `KNOWLEDGE_MAX_TOKENS` 控制 chunk 尺寸）。<br/>**EN**: Normalizes Markdown, splits chunks, and POSTs to `/api/v1/knowledge/documents` (supports `KNOWLEDGE_MAX_TOKENS`). |

## API 摘要 · API Surface

| Method | Endpoint                      | 描述 / Description                                                                                                                                                                                                                             |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/chat`                | **CN**：SSE 流式聊天，发送 `question/history/topK`，返回 `delta/sources/status` 事件，并在网络中断时自动续写。<br/>**EN**: SSE chat endpoint accepting `question/history/topK`, streaming `delta/sources/status` events with resumable output. |
| `GET`  | `/api/v1/knowledge/documents` | **CN**：列出所有已索引的知识文档及元数据。<br/>**EN**: Lists indexed knowledge documents with metadata.                                                                                                                                        |
| `POST` | `/api/v1/knowledge/documents` | **CN**：上载文档及 chunk，可设置 `generateEmbeddings`。<br/>**EN**: Upserts documents and chunks; optional `generateEmbeddings`.                                                                                                               |

## 知识摄取流程 · Knowledge Ingestion Pipeline

1. **CN**：运行 `pnpm exec playwright install chromium`（首次）并设置 `YUQUE_SPACE` 或 `YUQUE_DOC_URLS`。<br/>**EN**: Install Playwright browsers once and set `YUQUE_SPACE` or `YUQUE_DOC_URLS`.
2. **CN**：执行 `pnpm run ingest:yuque`，脚本将：抓取语雀 → 解析 sheet 数据 → OCR Canvas → 写入 `tmp/knowledge/*.md` + `tmp/knowledge/images/*`。<br/>**EN**: `pnpm run ingest:yuque` scrapes Yuque, parses sheet payloads, OCRs canvas tables, and saves Markdown/images under `tmp/knowledge`.
3. **CN**：运行 `pnpm run ingest:markdown`，将 Markdown 正规化、按 section/段落切 chunk（默认 1.8k tokens），可选生成嵌入并调用 `/api/v1/knowledge/documents`。<br/>**EN**: `pnpm run ingest:markdown` normalizes Markdown, splits by section/paragraph (~1.8k tokens), optionally generates embeddings, and POSTs to `/api/v1/knowledge/documents`.
4. **CN**：完成后可通过 `GET /api/v1/knowledge/documents` 校验导入结果。<br/>**EN**: Verify ingested documents via `GET /api/v1/knowledge/documents`.

## 前端体验 · Frontend Experience

- **CN**：`HomeRoute` 展示产品卖点、路线图链接、功能网格；`ChatRoute` 支持 agent 链路、topK 下拉、引用标签、本地/外部来源提醒、错误卡片与停止按钮。<br/>**EN**: `HomeRoute` markets the product with hero/feature grids/roadmap link; `ChatRoute` surfaces agent timelines, topK selectors, citation tags, local/external badges, error cards, and stop controls.
- **CN**：AI UI primitives 位于 `apps/web/src/components/ai-elements`，可在 Storybook/Vitest（待建）中复用。<br/>**EN**: AI UI primitives live under `apps/web/src/components/ai-elements`, ready for future Storybook/Vitest coverage.

## 文档与路线图 · Docs & Roadmap

- **CN**：`docs/development-plan.md`：实时交付计划；`docs/Multi-Modal-RAG-Agent-dev-document.md`：多模态设计；`docs/rfc-001-architecture-design.md`：体系架构；`docs/rfc-001-dev-task.md`：任务追踪。<br/>**EN**: `docs/development-plan.md` (live plan), `docs/Multi-Modal-RAG-Agent-dev-document.md` (multi-modal spec), `docs/rfc-001-architecture-design.md` (architecture RFC), and `docs/rfc-001-dev-task.md` (task tracker).

如需深入了解模块实现，请先阅读 `AGENTS.md`（操作守则），再查看 `backend/README.md` 与上述文档。<br/>For deeper dives, consult `AGENTS.md`, `backend/README.md`, and the docs above.
