# 🧩 Cangyun Multi-Modal RAG Agent — 开发任务清单 · Task Tracker

> **说明 / Notes**：所有任务均以 `CN/EN` 双语描述；若状态变更请同步勾选并简述。  
> **Legend**：`[x]` 完成 / Done，`[ ]` 待办 / Todo, `[-]` 进行中 / In progress

## 🏁 Phase 1：文字 RAG · Text RAG (W1–W6)

### ⚙️ 基座与基础设施 · Foundation & Infra

- [x] **Monorepo** — **CN**：pnpm workspace + Husky + lint-staged + Docker Compose（Postgres/Redis）。<br/>**EN**: pnpm workspace with Husky, lint-staged, and Docker Compose (Postgres/Redis).
- [ ] **CI/CD** — **CN**：GitHub Actions（lint/typecheck/test/build）、`/healthz`、全局异常过滤、结构化日志。<br/>**EN**: GitHub Actions pipeline plus `/healthz`, global filters, structured logging.
- [ ] **Observability** — **CN**：OpenTelemetry、Sentry、Redis 速率限制。<br/>**EN**: OpenTelemetry, Sentry, and Redis-backed rate limiting.

### 🤖 AI & Config

- [x] **AI Provider** — **CN**：`AIService` + `OpenAiProvider`（文本、流式、embeddings、工具调用）。<br/>**EN**: `AIService` + `OpenAiProvider` for text, streaming, embeddings, tool calls.
- [ ] **Multi-provider** — **CN**：DeepSeek/本地模型接入、成本/延迟指标。<br/>**EN**: Add DeepSeek/local models with cost/latency tracking.

### 📚 知识库 · Knowledge System

- [x] **Yuque Scraper** — **CN**：Playwright + OCR + Canvas 截图 + sheet 捕获。<br/>**EN**: Playwright scraper with OCR, canvas screenshots, sheet capture.
- [x] **Markdown Ingestor** — **CN**：规范化、chunk、token 计数、批量 `/api/v1/knowledge/documents`。<br/>**EN**: Normalization, chunking, token counts, batched `/api/v1/knowledge/documents`.
- [x] **Hybrid Search** — **CN**：pgvector + Full Text；嵌入失败时降级。<br/>**EN**: pgvector + full-text with graceful fallback.
- [ ] **Evaluation** — **CN**：黄金问答集与检索评测脚本。<br/>**EN**: Golden QA set and retrieval evaluation scripts.

### 💬 Chat 模块 · Chat Module

- [x] **SSE Endpoint** — **CN**：`/api/v1/chat` 多 Agent、sources/status 事件、网络续写、topK 参数。<br/>**EN**: `/api/v1/chat` multi-agent SSE with sources/status/resume/topK.
- [x] **Web UI** — **CN**：自定义 transport、Agent 进度链、引用抽屉、错误卡片、停止按钮。<br/>**EN**: Custom transport, agent chain, citation drawer, error cards, stop button.
- [ ] **Caching & QA** — **CN**：Redis 答案缓存、检索失败监控、多轮对话评估。<br/>**EN**: Redis answer cache, retrieval-failure monitoring, multi-turn QA evaluation.

### 📄 文档 · Docs

- [x] **Core docs** — **CN**：README、Backend README、AGENTS、开发计划、架构 RFC、多模态文档、任务清单。<br/>**EN**: README, backend README, AGENTS, development plan, architecture RFC, multimodal doc, task tracker.
- [ ] **CONTRIBUTING** — **CN**：贡献指南、API 示例、环境变量参考。<br/>**EN**: CONTRIBUTING guide, API samples, env reference.

## 🖼️ Phase 2：图像识别 · Image Intelligence (W7–W12)

- [ ] **Upload UI** — **CN**：拖拽上传、类型选择、预览。<br/>**EN**: Drag-and-drop upload with type selector and preview.
- [ ] **Image API** — **CN**：`/api/v1/analyze/image`（multipart + 结构化响应）。<br/>**EN**: `/api/v1/analyze/image` with multipart input and structured output.
- [ ] **OCR Layer** — **CN**：云 OCR Provider + Tesseract fallback。<br/>**EN**: Cloud OCR providers plus Tesseract fallback.
- [ ] **Skill Detection** — **CN**：图标模板匹配 + Vision + 知识联动。<br/>**EN**: Icon templates + Vision + knowledge linkage.
- [ ] **Rotation Stats** — **CN**：面板解析、循环评分、建议生成。<br/>**EN**: Panel parsing, rotation scoring, recommendation generation.
- [ ] **QA** — **CN**：30+ 截图回归集，Vitest/Playwright E2E。<br/>**EN**: 30+ screenshot regression suite with Vitest/Playwright E2E.

## 🎥 Phase 3：视频分析 · Video Analysis (W13–W16)

- [ ] **Task API** — **CN**：`/api/v1/analyze/video` → `taskId`，状态查询。<br/>**EN**: `/api/v1/analyze/video` returning `taskId` with status polling.
- [ ] **Worker Pipeline** — **CN**：Redis Streams + FFmpeg 抽帧 + OCR/识别 + 事件序列。<br/>**EN**: Redis Streams + FFmpeg sampling + OCR/detection + event sequencing.
- [ ] **Timeline Engine** — **CN**：模板比对、问题定位、建议生成、TTL 存储。<br/>**EN**: Template comparison, issue detection, recommendation output, TTL storage.
- [ ] **Report UI** — **CN**：时间轴展示、关键事件、导出、SSE/轮询更新。<br/>**EN**: Timeline visualization, key events, exports, SSE/polling updates.
- [ ] **Perf & Risk** — **CN**：并发阈值、重试、成本监控、p95 < 5min。<br/>**EN**: Concurrency limits, retries, cost monitoring, p95 < 5 min.

## 🛡️ 横切任务 · Cross-Cutting

- [ ] **Security** — **CN**：文件扫描、类型白名单、隐私声明。<br/>**EN**: File scanning, MIME whitelists, privacy notice.
- [ ] **Observability** — **CN**：指标命名、日志结构化、Tracing。<br/>**EN**: Metric naming, structured logging, tracing.
- [ ] **Testing** — **CN**：E2E（Playwright/Cypress）、负载/容量测试。<br/>**EN**: E2E (Playwright/Cypress) and load/capacity testing.

## 🗂️ Milestones

| 里程碑 / Milestone | 内容 / Scope                           | 状态 / Status        |
| ------------------ | -------------------------------------- | -------------------- |
| **M1**             | Phase 1 — 文字 RAG 基础、SSE、知识入库 | 进行中 / In progress |
| **M2**             | Phase 2 — 图像识别 & 循环统计          | 待启动 / Pending     |
| **M3**             | Phase 3 — 视频分析 & 报告系统          | 待启动 / Pending     |
