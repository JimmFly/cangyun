# Cangyun Multi-Modal RAG Agent 开发基准文档 · Development Baseline

## 1. 项目概述 · Project Overview

### 1.1 背景 / Background

- **CN**：《剑网三》苍云门派“分山劲”心法对循环、奇穴、装备的理解要求极高，资料分散在语雀、剑三魔盒、每日攻略等站点，新手难以同步最新赛季（山海源流）改动。
- **EN**: The JX3 Cangyun (Fenshanjin) specialization demands precise rotations, talents, and gear choices, yet the reference material is scattered across Yuque, JX3Box, and Daily Xoyo. Keeping up with the latest “Shanhai Yuanliu” patch is challenging for most players.

### 1.2 目标 / Goals

- **CN**：构建一个多模态 RAG 助手，聚焦 PVE 场景，提供权威攻略整合、可追溯引用、图像/视频辅助分析。
- **EN**: Deliver a multi-modal RAG assistant focused on PVE scenarios that consolidates trusted guides, offers traceable citations, and scales toward image/video assisted analysis.

### 1.3 范围 / Scope

| 阶段 / Phase | 内容 / Scope                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1      | **CN**：文字 RAG（问答、引用、联网搜索）。<br/>**EN**: Text RAG (Q&A, citations, online search).                                                           |
| Phase 2      | **CN**：图像识别与循环统计（截图上传 → OCR/识别 → 建议）。<br/>**EN**: Image recognition + rotation stats (screenshots → OCR/detection → recommendations). |
| Phase 3      | **CN**：视频分析（任务队列、时间轴对比、报告导出）。<br/>**EN**: Video analysis (task queue, timeline comparison, report exports).                         |

### 1.4 目标用户 / Target Users

- **CN**：PVE 新手、追求 DPS 的进阶玩家、团队指挥（需要快速查询奇穴/机制）。
- **EN**: PVE newcomers, DPS-focused veterans, and raid leaders needing quick access to talents/mechanics.

## 2. 技术栈 · Tech Stack

### 2.1 前端 / Frontend

- **CN**：React 19 + TypeScript + Vite；Tailwind + shadcn/ui 构建 UI；React Router 管理路由；Vercel AI SDK（`@ai-sdk/react`）提供 `useChat`；`CustomChatTransport` 解析 SSE 并注入 agent 状态/引用。
- **EN**: React 19 + TypeScript + Vite; Tailwind + shadcn/ui for UI; React Router for routing; Vercel AI SDK (`@ai-sdk/react`) powers `useChat`; `CustomChatTransport` consumes SSE, injecting agent status and citations.

### 2.2 后端 / Backend

- **CN**：NestJS 11、`@nestjs/config` + zod 校验 env；`AIService` 通过 Vercel AI SDK 调用 OpenAI（文本 + 流式 + embeddings）；PostgreSQL 15 + `pgvector`；可选 Redis/S3；Playwright/Tesseract 用于脚本。
- **EN**: NestJS 11 with `@nestjs/config` + zod env checks; `AIService` wraps OpenAI via the Vercel AI SDK (text, streaming, embeddings); PostgreSQL 15 + `pgvector`; optional Redis/S3; Playwright/Tesseract used in scripts.

### 2.3 AI 策略 / AI Strategy

- **CN**：Phase 1 统一使用 OpenAI（`gpt-4o-mini` + `text-embedding-3-large`），通过工具调用接入 `cangyun_search`/`cangyun_fetch_page`/`fetch_current_season_guide`；未来扩展 DeepSeek 与本地模型降本。
- **EN**: Phase 1 standardizes on OpenAI (`gpt-4o-mini`, `text-embedding-3-large`) with tool calls for `cangyun_search`, `cangyun_fetch_page`, and `fetch_current_season_guide`; future phases plan DeepSeek/local models to reduce cost.

## 3. 核心能力 · Core Capabilities

### 3.1 Phase 1：文字问答 / Text QA

- **CN**：问题经 `KnowledgeAgent`（pgvector + 全文）和 `ExternalAgent`（Perplexity 限域搜索）并行检索；`CoordinatorAgent` 构建系统提示，优先引用“山海源流-苍云技改.md”等权威文档，流式返回答案 + sources + agent status。
- **EN**: Questions trigger `KnowledgeAgent` (pgvector + full-text) and `ExternalAgent` (Perplexity with whitelisted domains) in parallel; `CoordinatorAgent` crafts the system prompt, prioritizing the “Shanhai Yuanliu – Cangyun Changes” doc, and streams answers with citations and agent status.

#### 用户故事 / User Stories

1. **CN**：作为分山劲新手，我能询问技能循环并得到引用出处。  
   **EN**: As a new Fenshanjin player, I can ask about rotations and receive cited answers.
2. **CN**：作为团队指挥，我能快速查询奇穴/机制改动并确认赛季背景。  
   **EN**: As a raid leader, I quickly check talent/mechanic changes with explicit season context.

### 3.2 Phase 2：图像识别 / Image Intelligence

- **CN**：提供拖拽上传 → OCR（云优先，Tesseract 兜底）→ 技能图标匹配（模板 + Vision）→ Rotation Stats → 知识库推荐。
- **EN**: Enables drag-and-drop uploads → OCR (cloud-first, Tesseract fallback) → skill icon detection (templates + Vision) → rotation stats → knowledge-based advice.

### 3.3 Phase 3：视频分析 / Video Analysis

- **CN**：`/api/v1/analyze/video` 返回 `taskId`；Redis Streams Worker 使用 FFmpeg 抽帧、执行 OCR/识别、构建事件时间轴、比对标准循环并输出报告。
- **EN**: `/api/v1/analyze/video` returns a `taskId`; Redis Streams workers run FFmpeg sampling, OCR/detection, build event timelines, compare against templates, and emit reports.

## 4. 系统架构 · System Architecture

```
React Web (Vite SPA)
  │  useChat + CustomChatTransport (SSE)
  ▼
NestJS API
  - chat module (agents + SSE)
  - knowledge module (ingest/search)
  - guide module (whitepaper lookup)
  - cangyun module (Perplexity search & fetch)
  - ai module (OpenAI provider)
  │
  ├─ PostgreSQL + pgvector (documents, chunks)
  ├─ Optional Redis (future cache/rate limit)
  └─ Scripts (Playwright/Tesseract ingestion)
```

- **CN**：SSE 使用 `text/event-stream`，事件类型包含 `delta/sources/status/error`；sources 包括本地知识库 chunk 与联网搜索链接。
- **EN**: SSE leverages `text/event-stream` with `delta/sources/status/error` frames; sources combine local knowledge chunks and online search links.

## 5. 关键服务 · Key Services

### 5.1 KnowledgeService

- **CN**：`indexDocument` upsert 文档并在事务中 `replaceChunks`；若 `generateEmbeddings` 为 true，则调用 `AIService.embedText`，失败时降级为纯文本搜索。
- **EN**: `indexDocument` upserts documents and transactionally `replaceChunks`; when `generateEmbeddings` is true it calls `AIService.embedText`, falling back to lexical search upon failure.

### 5.2 ChatService & Agents

```ts
// 核心伪代码 / Core pseudocode
const knowledgeResult = knowledgeAgent.search(enhancedQuery, topK);
const externalResult = externalAgent.search(originalQuestion, topK);
const sources = mergeSources(knowledgeResult, externalResult);
return coordinatorAgent.generateAnswer({
  question,
  knowledgeResult,
  externalResult,
  history,
});
```

- **CN**：`enhanceSearchQuery` 根据奇穴/副本/赛季关键词注入额外 token；`guardStream` 统计 delta 并在网络异常时保存 `accumulatedContent` 以续写。
- **EN**: `enhanceSearchQuery` injects season/talent/raid keywords; `guardStream` counts deltas and stores `accumulatedContent` to resume after network glitches.

### 5.3 CangyunSearchService & GuideService

- **CN**：Perplexity 搜索结果需解析 JSON/提取链接，过滤白名单域名后按“山海源流”/“弓月城”优先级排序；`cangyun_fetch_page` 会 strip HTML 并缓存正文。
- **EN**: Perplexity responses are parsed for JSON/links, filtered against whitelisted domains, then scored to prioritize “Shanhai Yuanliu” or “Gongyue City”; `cangyun_fetch_page` strips HTML and caches the text.
- **CN**：GuideService 通过 `GUIDE_BASE_URL` + 关键词定位白皮书，若搜索不可用则尝试站内 API 或 Playwright 抓取。
- **EN**: GuideService targets the whitepaper via `GUIDE_BASE_URL` + keywords, falling back to site APIs or Playwright when search fails.

### 5.4 多模态展望 / Multimodal Outlook

- **CN**：Phase 2/3 将沿用相同的服务边界：`ai` 提供 Vision/多模态接口，`mm-image`/`mm-video` 模块负责媒体处理，`knowledge` 继续作为事实来源。
- **EN**: Phases 2/3 reuse the same boundaries: the `ai` module exposes Vision/multimodal calls, `mm-image`/`mm-video` handle media workflows, and `knowledge` remains the ground-truth store.

## 6. 验收与质量 · Acceptance & Quality

- **CN**：Phase 1 要求 `pnpm run check`、SSE 引用展示、首轮知识入库完成；Phase 2 引入截图回归 + OCR 准确率 ≥90%；Phase 3 需要 2min/1080p 报告 p95 < 5 分钟。
- **EN**: Phase 1 requires `pnpm run check`, SSE citations, and initial ingestion; Phase 2 adds screenshot regression suites with ≥90% OCR accuracy; Phase 3 demands p95 < 5 minutes for 2‑min/1080p videos.

本文件与 `docs/development-plan.md`、`docs/rfc-001-architecture-design.md`、`docs/rfc-001-dev-task.md` 一起维护，确保需求、架构与执行一致。  
Maintain this document alongside the development plan, architecture RFC, and task tracker to keep requirements, architecture, and execution aligned.
