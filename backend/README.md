# Cangyun Backend (NestJS)

> **CN**：NestJS 11 服务，提供多 Agent RAG Chat、知识入库 API、语雀/攻略站工具抽象，并以 Vercel AI SDK 封装 OpenAI（未来可扩展到其他模型）。  
> **EN**: NestJS 11 service powering the multi-agent RAG chat endpoint, knowledge ingestion APIs, and Yuque/guide tooling, built on top of the Vercel AI SDK for OpenAI with future-friendly hooks.

## 模块概览 · Module Overview

| 模块 / Module | 描述 / Description                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`      | **CN**：zod 校验的环境加载器，暴露 typed `AppConfig`。<br/>**EN**: zod-validated env loader exposing typed `AppConfig`.                                                                                                                |
| `database`    | **CN**：pg Pool/Client 管理，启用 `pgvector` 扩展。<br/>**EN**: PostgreSQL pool/client helpers with `pgvector` enabled.                                                                                                                |
| `ai`          | **CN**：AI Provider 抽象（目前实现 `OpenAiProvider`），支持文本生成、流式输出、向量嵌入。<br/>**EN**: AI provider abstraction (`OpenAiProvider`) handling text generation, streaming, and embeddings.                                  |
| `knowledge`   | **CN**：文档 upsert、chunk 替换、pgvector 检索，支持嵌入降级。<br/>**EN**: Document upsert, chunk replacement, pgvector search with lexical fallback.                                                                                  |
| `chat`        | **CN**：多 Agent（KnowledgeAgent + ExternalAgent + CoordinatorAgent）并行搜索、SSE 流式推理、sources/status 事件。<br/>**EN**: Multi-agent orchestration (knowledge/external/coordinator), SSE streaming, `sources` + `status` events. |
| `cangyun`     | **CN**：Perplexity 驱动的语雀/剑三魔盒/每日攻略限定搜索与页面抓取，带缓存与域名白名单。<br/>**EN**: Perplexity-backed search constrained to Yuque/JX3Box/Xoyo plus cached page fetching with strict whitelists.                        |
| `guide`       | **CN**：当前赛季白皮书定位：Perplexity 查询 + 站内 API/爬虫降级。<br/>**EN**: Current-season whitepaper discovery via Perplexity with site API/scrape fallbacks.                                                                       |

## 运行条件 · Requirements

- **CN**：PostgreSQL 15+（启用 `CREATE EXTENSION IF NOT EXISTS vector`）、`DATABASE_URL`、`OPENAI_API_KEY`、`PERPLEXITY_API_KEY`（若需联网搜索）、可选 Redis/S3。  
  **EN**: PostgreSQL 15+ with `vector` extension, `DATABASE_URL`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY` (for online search), optional Redis/S3 endpoints.
- **CN**：所有关键变量在 `.env.example` 中列出，`backend/src/config/env.validation.ts` 会在缺失时阻止启动。  
  **EN**: `.env.example` lists every variable; `env.validation.ts` aborts boot when required values are missing.

## 本地开发 · Local Development

```bash
# 在仓库根目录安装依赖与公共包
pnpm install
pnpm run build:common

# （可选）启动基础设施
docker compose up -d postgres redis

# 启动后端
pnpm run dev:backend          # ts-node-dev + watch

# 质量检查
pnpm --filter cangyun-backend run lint
pnpm --filter cangyun-backend run test
pnpm --filter cangyun-backend run test:cov
```

## API · Interfaces

| Method | Path                          | 描述 / Description                                                                                                                                                                                                                                                                                                                                   |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/chat`                | **CN**：接受 `{ question, history?, topK? }`，并以 `text/event-stream` 输出 `delta`（文本）、`sources`（引用）、`status`（Agent 状态）、`error`。网络中断后会自动续写，最多重试 2 次。<br/>**EN**: Accepts `{ question, history?, topK? }` and streams `delta`, `sources`, `status`, and `error` events over SSE with auto-resume (up to 2 retries). |
| `GET`  | `/api/v1/knowledge/documents` | **CN**：列出 `knowledge_documents`，含 metadata/version。<br/>**EN**: Lists `knowledge_documents` with metadata/version info.                                                                                                                                                                                                                        |
| `POST` | `/api/v1/knowledge/documents` | **CN**：写入文档及 chunks；`generateEmbeddings=true` 时服务端调用 OpenAI 向量化（失败时降级）。<br/>**EN**: Upserts documents + chunks; set `generateEmbeddings=true` to trigger server-side embeddings with graceful fallback.                                                                                                                      |

### Chat Streaming Notes

- **CN**：`ChatService` 并行启动 `KnowledgeAgentService`（pgvector 搜索）与 `ExternalAgentService`（Perplexity 限域搜索），随后由 `CoordinatorAgentService` 依据 system prompt 合成答案；`guardStream` 负责记录 delta 数量并在网络错误时保存已生成内容。  
  **EN**: `ChatService` runs `KnowledgeAgentService` (pgvector) and `ExternalAgentService` (Perplexity) in parallel before `CoordinatorAgentService` synthesizes the answer; `guardStream` tracks deltas and buffers text for resume-on-network-failure.
- **CN**：Agent 状态事件形如 `{ type: 'status', step, label, agent, tool }`，前端的 ChainOfThought 组件基于这些事件渲染进度。  
  **EN**: Agent status payloads look like `{ type: 'status', step, label, agent, tool }` and feed the frontend ChainOfThought timeline.

### External Search & Guide Tools

- **CN**：`CangyunSearchService` 通过 `cangyun_search`/`cangyun_fetch_page` 工具向 AI SDK 暴露联网能力；结果缓存 30 分钟，正文缓存 24 小时，自动过滤非白名单域名。  
  **EN**: `CangyunSearchService` exposes `cangyun_search` and `cangyun_fetch_page` tools to the AI SDK, caching search results for 30 minutes and fetched pages for 24 hours while enforcing whitelisted domains.
- **CN**：`GuideService` 可根据 `GUIDE_BASE_URL` + `GUIDE_WHITEPAPER_KEYWORDS` 精确搜索赛季白皮书，若 Perplexity 不可用则尝试站内 API 或 Playwright 抓取。  
  **EN**: `GuideService` targets the season whitepaper at `GUIDE_BASE_URL` with `GUIDE_WHITEPAPER_KEYWORDS`, falling back to site APIs or Playwright scraping when Perplexity is unavailable.

## 知识入库 · Knowledge Ingestion

1. **CN**：运行 `pnpm run ingest:yuque` 生成 `tmp/knowledge/*.md` 与图片；脚本会监听 sheet API 响应、OCR Canvas，并写入 frontmatter。  
   **EN**: `pnpm run ingest:yuque` scrapes Yuque into `tmp/knowledge/*.md` plus images, capturing sheet payloads and canvas OCR with frontmatter metadata.
2. **CN**：执行 `pnpm run ingest:markdown`，脚本会格式化 Markdown、分块（按 section/paragraph）、计算 tokens，并调用 `/api/v1/knowledge/documents`（默认 `generateEmbeddings=true`）。  
   **EN**: `pnpm run ingest:markdown` normalizes Markdown, chunks by section/paragraph with token counts, and POSTs to `/api/v1/knowledge/documents` (embedding generation on by default).
3. **CN**：服务端存储逻辑：`KnowledgeService` 先 upsert 文档，再 `replaceChunks`（事务删除旧 chunk → 批量插入新 chunk，必要时写入 `vector` 字面量）。  
   **EN**: Server flow: `KnowledgeService` upserts the document, then `replaceChunks` transactionally deletes/reinserts chunks, persisting vector literals when embeddings exist.

## 调试提示 · Debugging Tips

- **CN**：将 `NODE_ENV=development` 可解锁详细日志（包括 Perplexity 原始响应片段、检索命中数、向量降级警告）。  
  **EN**: Set `NODE_ENV=development` to see verbose logs such as raw Perplexity snippets, retrieval hit counts, and vector-fallback warnings.
- **CN**：若 SSE 流被代理截断，可留意 `ChatStreamError`（`STREAM_NETWORK_ERROR`）日志；前端会收到错误并尝试续写。  
  **EN**: If proxies terminate SSE, watch for `ChatStreamError` (`STREAM_NETWORK_ERROR`) logs—the frontend surfaces the error and automatically resumes when partial content exists.

更多上下文请参阅仓库根目录的 `README.md` 与 `docs/` 文档。  
For broader context, see the repo root `README.md` and the `docs/` folder.
