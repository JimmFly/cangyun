# RFC-0001：Cangyun Multi-Modal RAG Agent 架构设计 · Architecture Design

- **状态 / Status**：Proposed → Active (Phase 1)
- **作者 / Author**：@JimmFly + contributors
- **审阅截止 / Review Due**：2025-11-12 (Asia/Singapore)
- **范围 / Scope**：Phase 1（文字 RAG）→ Phase 2（图像）→ Phase 3（视频）
- **关联文档 / Related Docs**：`Multi-Modal-RAG-Agent-dev-document.md`, `development-plan.md`, `rfc-001-dev-task.md`

---

## 1. 摘要 · Summary

- **CN**：定义 Cangyun 的端到端架构：React 19 Web 客户端、NestJS 11 API、多 Agent RAG、pgvector 知识库、Perplexity 搜索工具、未来图像/视频流水线。目标是在 Phase 1 内交付稳定低延迟的文字 RAG，并为 Phase 2/3 复用相同骨架。
- **EN**: Defines the end-to-end architecture spanning a React 19 web client, NestJS 11 API, multi-agent RAG workflow, pgvector knowledge base, Perplexity-powered tools, and upcoming image/video pipelines. Objective: ship a stable low-latency text RAG in Phase 1 while preserving hooks for Phases 2/3.

## 2. 目标与非目标 · Goals & Non-Goals

| 类型          | 内容                                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goals**     | **CN**：模块化 RAG（知识摄取 → 检索 → 生成 → 引用）、多 Agent 编排、SSE 流式体验、跨前后端 TypeScript、一致的可观测性接口。<br/>**EN**: Modular RAG (ingest → retrieve → generate → cite), multi-agent orchestration, SSE streaming UX, TypeScript end-to-end, shared observability hooks. |
| **Non-Goals** | **CN**：不做游戏自动化/外挂，不在 Phase 1 引入复杂账户体系或本地大模型。<br/>**EN**: No in-game automation, no heavyweight account/billing system, no on-prem LLMs in Phase 1.                                                                                                             |

## 3. 架构总览 · System Overview

```
┌─────────────── Frontend (React 19 + Vite) ───────────────┐
│  useChat + CustomChatTransport (SSE)                     │
│  - HomeRoute (marketing)                                 │
│  - ChatRoute (agent chain, citations, topK, stop)        │
└───────────────▲──────────────────────────────────────────┘
                │ text/event-stream
┌───────────────┴──────────────────────────────────────────┐
│              Backend (NestJS 11)                         │
│  Modules:                                                │
│   • chat (agents + SSE)                                  │
│   • knowledge (ingest/search via pgvector)               │
│   • cangyun (Perplexity search + page fetch)             │
│   • guide (current season whitepaper lookup)             │
│   • ai (Vercel AI SDK provider)                          │
│   • scripts (Playwright/Tesseract ingestion)             │
└───────┬───────────────────────┬──────────────────────────┘
        │                       │
   PostgreSQL + pgvector   Future Redis/S3
```

## 4. 关键设计决策 · Key Decisions

1. **pgvector on PostgreSQL**
   - **CN**：统一事务管理与文本/向量检索，便于自托管；若后续迁移到 Pinecone/Chroma，可通过 repository token 替换实现。
   - **EN**: Keeps vectors and relational data together; repository interface allows swapping to Pinecone/Chroma later.
2. **Vercel AI SDK Provider 层**
   - **CN**：`AIService` 屏蔽 OpenAI/未来模型差异，提供 `generateText/streamText/embedText`。
   - **EN**: `AIService` hides provider choices and exposes `generateText/streamText/embedText`.
3. **多 Agent Chat**
   - **CN**：KnowledgeAgent + ExternalAgent 并行检索，CoordinatorAgent 负责提示与输出，SSE 提供 `status` 事件。
   - **EN**: Run KnowledgeAgent + ExternalAgent in parallel; CoordinatorAgent crafts prompts and emits SSE status events.
4. **工具化联网搜索**
   - **CN**：`cangyun_search`/`cangyun_fetch_page`/`fetch_current_season_guide` 作为工具注入 AI SDK，所有外部调用都在受控范围内。
   - **EN**: Tools expose curated search/fetch APIs to the AI SDK, ensuring constrained surface area.
5. **多模态扩展点**
   - **CN**：Phase 2/3 新增 `mm-image`/`mm-video` 模块，但复用 `ai`、`knowledge`、`config`、`database`；媒体任务通过 Redis Streams 或托管队列异步执行。
   - **EN**: Phases 2/3 add `mm-image`/`mm-video` modules while reusing existing ai/knowledge/config/database; media jobs run via Redis Streams or managed queues.

## 5. 模块设计 · Module Design

### 5.1 chat 模块

- **CN**：`ChatController` 暴露 `/api/v1/chat`（POST + SSE）；`ChatService` 负责查询增强、并行检索、source 合并、流式守护；`ChatGateway` 未来可扩展 WebSocket。
- **EN**: `ChatController` serves `/api/v1/chat` (POST/SSE); `ChatService` handles query enrichment, parallel search, source merging, and stream guarding; `ChatGateway` reserved for future WebSockets.

### 5.2 knowledge 模块

- **CN**：`KnowledgeService` 通过 `KnowledgeRepository` token 操作数据库；`postgres-knowledge.repository` 使用事务删除/插入 chunk，embedding 以 `vector` 字面量写入。
- **EN**: `KnowledgeService` relies on `KnowledgeRepository` token; the Postgres repository transactionally deletes/inserts chunks and saves embeddings as `vector` literals.

### 5.3 cangyun / guide 模块

- **CN**：`CangyunSearchService` 负责 Perplexity 搜索 → JSON/链接解析 → 域名过滤 → 优先级排序 → 缓存；`GuideService` 以 `GUIDE_BASE_URL` + 关键词定位白皮书并缓存结果。
- **EN**: `CangyunSearchService` handles Perplexity search → JSON parsing → domain filtering → priority ranking → caching; `GuideService` targets whitepapers using `GUIDE_BASE_URL` + keywords with cached responses.

### 5.4 ai 模块

- **CN**：`OpenAiProvider` 调用 `ai`/`@ai-sdk/openai` 实现 generate/stream/embed，并记录模型配置；后续可添加 `DeepSeekProvider`。
- **EN**: `OpenAiProvider` leverages `ai` + `@ai-sdk/openai` for generate/stream/embed and logs chosen models; future providers (DeepSeek) plug into the same token.

### 5.5 scripts

- **CN**：`scripts/knowledge/ingest-yuque.ts`（Playwright + Turndown + OCR）；`ingest-markdown.ts`（格式化、chunk、API 上传）。脚本运行在仓库根目录，依赖 `.env.local`。
- **EN**: `ingest-yuque.ts` uses Playwright + Turndown + OCR; `ingest-markdown.ts` normalizes, chunks, and posts to the API. Both respect `.env.local`.

## 6. Phase 2/3 扩展 · Phase 2/3 Extensions

- **CN**：`mm-image` 模块暴露 `/api/v1/analyze/image`，包含 OCR Provider、技能检测、Rotation 分析器；`mm-video` 模块暴露 `/api/v1/analyze/video`，结合 Redis Streams + Worker + FFmpeg。
- **EN**: `mm-image` exposes `/api/v1/analyze/image` with OCR providers, skill detection, rotation analyzer; `mm-video` exposes `/api/v1/analyze/video` backed by Redis Streams, workers, and FFmpeg.
- **CN**：前端通过统一的上传组件与任务视图消费结果，沿用 SSE/轮询策略。
- **EN**: Frontend reuses unified upload widgets and task views, using SSE/polling for updates.

## 7. 风险与缓解 · Risks & Mitigations

| 风险 / Risk               | 缓解 / Mitigation                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Perplexity API 不稳定** | **CN**：缓存成功响应、超时/429 时退回知识库结果，必要时启用站内抓取。<br/>**EN**: Cache successful responses, fall back to knowledge-only answers on timeout/429, enable site scraping as backup.                |
| **SSE 被代理截断**        | **CN**：`guardStream` 保存 `accumulatedContent` 并自动重试；前端显示错误并提示刷新。<br/>**EN**: `guardStream` stores `accumulatedContent` and auto-retries; frontend surfaces errors and allows manual refresh. |
| **知识库数据陈旧**        | **CN**：`ingest-yuque` 支持 `YUQUE_DOC_URLS` 精准同步；计划加入变更检测与 CI 校验。<br/>**EN**: `ingest-yuque` accepts `YUQUE_DOC_URLS` for targeted sync; change detection + CI validation planned.             |

## 8. 开放问题 · Open Questions

1. **CN**：Phase 2 OCR Provider 选型（自建 vs 云 API）？  
   **EN**: Which OCR provider to adopt in Phase 2 (self-hosted vs cloud)?
2. **CN**：是否需要专门的 Prompt Library/Testing Framework（promptlint、guidance 等）？  
   **EN**: Do we need a dedicated prompt library/testing framework (promptlint, Guidance, etc.)?
3. **CN**：视频任务队列是否采用 Redis Streams 还是云队列（Upstash/QStash）？  
   **EN**: Should video jobs rely on Redis Streams or a managed queue (Upstash/QStash)?

---

本 RFC 将随 Phase 迭代更新；若关键决策发生变化，请提交新的 RFC 或更新本文件并标记评审。  
This RFC evolves alongside each phase; submit a follow-up RFC or update this file (with review) when decisions change.
