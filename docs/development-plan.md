# Cangyun Multi-Modal RAG Agent 开发计划 · Development Plan

## 当前状态概览 · Current Snapshot

- **CN**：Monorepo（pnpm workspace + Husky + ESLint + Prettier）稳定运行，`pnpm run dev` 可并行启动 web 与 backend；TypeScript 项目引用由根 `tsconfig` 统一管理。  
  **EN**: The pnpm workspace (with Husky/ESLint/Prettier) runs cleanly, `pnpm run dev` starts both the web and backend stacks, and project references are managed through the root `tsconfig`.
- **CN**：后端已串联 `AppConfigModule`、`AiModule`、`KnowledgeModule`、`ChatModule`、`GuideModule`、`CangyunModule`，`/api/v1/chat` 通过多 Agent（知识库 + Perplexity + 协调）输出 SSE，含引用与 Agent 状态事件。  
  **EN**: The backend wires `AppConfigModule`, `AiModule`, `KnowledgeModule`, `ChatModule`, `GuideModule`, and `CangyunModule`; `/api/v1/chat` runs the multi-agent (knowledge + Perplexity + coordinator) pipeline and streams SSE with references and agent-status events.
- **CN**：`apps/web` 的 `ChatRoute` 采用 `CustomChatTransport` 处理 `sources/delta/status/error`，支持 topK 选择、引用抽屉、Agent 进度链、流式停止。  
  **EN**: `apps/web` wraps SSE handling inside `CustomChatTransport`, enabling topK selection, citation drawers, agent timelines, and stop controls.
- **CN**：知识摄取脚本（Yuque + Markdown）可抓取 Canvas/OCR、解析 sheet JSON，并调用 `/api/v1/knowledge/documents` 生成 pgvector 索引。  
  **EN**: The Yuque + Markdown scripts scrape canvas/OCR data, parse sheet JSON, and invoke `/api/v1/knowledge/documents` to build pgvector indexes.

## 近期进度 · Recent Updates

1. **CN**：多 Agent ChatService 支持网络中断续写、查询增强（奇穴/副本关键词）、sources 列表合并外部搜索结果。  
   **EN**: ChatService now resumes after network failures, enriches queries (e.g., talent/raid keywords), and merges external references into the SSE `sources`.
2. **CN**：`CangyunSearchService`/`GuideService` 引入 Perplexity 联网搜索，限定域名并缓存 30 min；`cangyun_fetch_page` 对正文做 8k 字符截断。  
   **EN**: `CangyunSearchService` and `GuideService` leverage Perplexity with domain whitelists, 30‑minute caches, and 8k-character page truncation.
3. **CN**：前端 Chat UI 增加 Agent 进度链、消息复制/重试、topK 下拉、引用标签、错误卡片。  
   **EN**: The chat UI gained agent progress chains, copy/regenerate actions, topK selector, citation labels, and inline error cards.
4. **CN**：`ingest-yuque.ts` 捕获 sheet API 响应并写入 frontmatter，`ingest-markdown.ts` 规范标题/列表/表格并支持 `KNOWLEDGE_MAX_TOKENS`。  
   **EN**: `ingest-yuque.ts` records sheet payloads in frontmatter, while `ingest-markdown.ts` normalizes headings/lists/tables and obeys `KNOWLEDGE_MAX_TOKENS`.

## Phase 1（W1–W6）· 文字 RAG MVP

### ⚙️ 基建 / Infrastructure

- [x] **CN**：Monorepo、pnpm、lint-staged、Husky、Docker Compose（Postgres+Redis）。  
       **EN**: Workspace scaffolding, lint-staged, Husky, and Docker Compose (Postgres + Redis).
- [ ] **CN**：GitHub Actions（lint/typecheck/test/build）、`/healthz`、全局异常过滤、统一日志。  
       **EN**: GitHub Actions (lint/typecheck/test/build), `/healthz`, global exception filters, unified logging.
- [ ] **CN**：OpenTelemetry + Sentry + Redis 速率限制。  
       **EN**: OpenTelemetry + Sentry instrumentation plus Redis-based rate limiting.

### 🤖 AI Provider & Config

- [x] **CN**：`AIService` + `OpenAiProvider`（文本生成、流式、嵌入、工具调用）。  
       **EN**: `AIService` + `OpenAiProvider` covering generation, streaming, embeddings, and tool hooks.
- [ ] **CN**：多 Provider 适配（DeepSeek/本地模型）与成本/延迟指标。  
       **EN**: Additional providers (DeepSeek/local) and cost/latency metrics.

### 📚 知识库 / Knowledge Pipeline

- [x] **CN**：语雀抓取脚本（Playwright、OCR、Canvas 截图、sheet 捕获）。  
       **EN**: Yuque scraping with Playwright, OCR, canvas screenshots, and sheet capture.
- [x] **CN**：Markdown 导入器（格式化、chunk、token 计数、批量 API 调用、optional embeddings）。  
       **EN**: Markdown importer with formatting, chunking, token counts, batched API calls, optional embeddings.
- [x] **CN**：pgvector + Full Text 混合检索（knowledge repository）。  
       **EN**: Hybrid pgvector + full-text retrieval inside the knowledge repository.
- [ ] **CN**：黄金问答集 / 检索评测脚本。  
       **EN**: Golden QA set and retrieval evaluation scripts.

### 💬 Chat 模块 / Chat Module

- [x] **CN**：`/api/v1/chat` SSE（多 Agent、sources/status 事件、网络续写、topK 参数、system prompt 加强）。  
       **EN**: `/api/v1/chat` SSE with multi-agent orchestration, `sources/status` events, resume-on-disconnect, topK parameter, and reinforced system prompt.
- [x] **CN**：Web Chat UI（自定义 transport、Agent 进度链、引用展示、错误提示、stop 控件）。  
       **EN**: Web chat UI with custom transport, agent chain, citation view, error alerts, and stop control.
- [ ] **CN**：答案缓存（Redis）、检索失败 fallback 监控、对话上下文评估。  
       **EN**: Answer caching (Redis), search-failure monitoring, and dialogue-context evaluation.

### 📄 文档 / Docs

- [x] **CN**：README、Backend README、AGENTS、开发计划、多模态设计、架构 RFC、任务清单。  
       **EN**: README, backend README, AGENTS, development plan, multi-modal design doc, architecture RFC, and task tracker.
- [ ] **CN**：CONTRIBUTING.md、环境变量参考、API 示例。  
       **EN**: CONTRIBUTING guide, env reference, and API samples.

**Phase 1 交付标准 / Definition of Done**

- **CN**：`pnpm run check` 全绿；前端可与后端对话、展示引用；知识库完成首轮导入。
- **EN**: `pnpm run check` passes; frontend converses with backend and shows citations; first knowledge ingestion cycle completed.

## Phase 2（W7–W12）· 图像识别与循环统计

### 上传与接口 / Upload & API

- [ ] **CN**：Web 端图片上传（拖拽 + 类型选择 + 预览）。  
       **EN**: Web drag‑and‑drop uploads with type selector and preview.
- [ ] **CN**：`/api/v1/analyze/image` 多部分上传、返回结构化分析。  
       **EN**: `/api/v1/analyze/image` multipart endpoint returning structured analysis.

### 技能识别 / Skill Detection

- [ ] **CN**：OCR Provider 抽象（云服务优先，Tesseract 兜底）。  
       **EN**: OCR provider abstraction (cloud-first, Tesseract fallback).
- [ ] **CN**：技能图标模板匹配 + Vision fallback + 知识联动。  
       **EN**: Icon template matching with Vision fallback and knowledge linking.
- [ ] **CN**：Rotation Stats 结构（面板解析、奇穴建议、循环评分）。  
       **EN**: Rotation stats schema covering panel parsing, talent advice, and rotation scoring.

### 质量与安全 / Quality & Safety

- [ ] **CN**：临时媒体存储 + TTL 清理、类型白名单、30+ 截图回归集。  
       **EN**: Temporary media storage with TTL cleanup, MIME whitelists, and 30+ screenshot regression set.
- [ ] **CN**：Vitest/Playwright 端到端测试。  
       **EN**: Vitest/Playwright end-to-end coverage.

## Phase 3（W13–W16）· 视频分析与高级能力

### 异步任务 / Asynchronous Pipeline

- [ ] **CN**：`/api/v1/analyze/video` → `taskId`，Redis Streams Worker 执行 FFmpeg 抽帧、事件识别。  
       **EN**: `/api/v1/analyze/video` returning `taskId` with Redis Streams workers orchestrating FFmpeg sampling and event recognition.

### 分析引擎 / Analysis Engine

- [ ] **CN**：时间轴构建、循环模板比对、问题定位、报告存储（TTL）。  
       **EN**: Timeline reconstruction, template comparison, issue detection, and TTL-bound report storage.
- [ ] **CN**：Web 报告（时间轴、关键事件、导出、SSE/轮询更新）。  
       **EN**: Web reports with timelines, key events, export, and SSE/polling updates.

### 性能与风控 / Performance & Risk

- [ ] **CN**：并发阈值、重试策略、成本监控、p95 < 5min（2min/1080p）。  
       **EN**: Concurrency thresholds, retry logic, cost monitors, and p95 < 5 min for 2‑min/1080p videos.
- [ ] **CN**：匿名配额 + 速率限制 + 审计日志。  
       **EN**: Anonymous quotas, rate limiting, and audit logging.

## 横向工作流 · Cross-Cutting Tracks

- **CN**：安全（文件扫描、白名单、隐私声明）；可观测性（结构化日志、指标、Tracing）；Milestone 回顾（第 2/6/12 周）。
- **EN**: Security (file scanning, whitelists, privacy notice); observability (structured logs, metrics, tracing); milestone reviews (week 2/6/12).
