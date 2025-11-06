# Cangyun Multi-Modal RAG Agent 开发计划

## 当前状态概览

- Monorepo 结构已搭建，前端 `apps/web` 已提供极简的控制台壳层与聊天界面。
- `apps/common` 目录下的共享包已创建，但除 UI 组件外其余内容仍为空壳。
- 后端 `backend` 保持 NestJS 脚手架初始状态，仅提供 `GET /` Hello World。
- 基础工程化能力（Husky、ESLint、Prettier、pnpm workspace）已就位，尚缺 CI/CD、数据库、AI Provider 接入与文档联动。

## 进度更新（近期）

- 引入 `DatabaseModule` + `PostgresKnowledgeRepository`，`/api/v1/knowledge/documents` 现已落库 pgvector；查询阶段会根据 AI 生成的向量排序。
- `ChatRoute` 支持可调节的检索片段数量（3/6/8/10）并遵循 “You Might Not Need an Effect” 原则整理状态。
- `scripts/knowledge/ingest-yuque.ts` 基于 Playwright 抓取公开页面，输出 Markdown；首次运行需 `pnpm exec playwright install chromium`，`YUQUE_MAX_DOCS` / `YUQUE_SCROLL_ATTEMPTS` 控制抓取范围，Canvas 表格通过截图 + OCR (`tesseract.js`) 生成文本附件。
- 后端 AI 模块切换为 [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)，统一处理流式响应与向量生成，替代手写 fetch。
- 新增 `docker-compose.yml`（pgvector + Redis）便于本地启动依赖服务，`.env.example` 可直接指向该配置。
- Yuque 爬虫脚本支持无 Token 公共空间，保留 Token 时仍可获得更高配额与私有空间访问。
- 技能系数汇总的查询仍缺乏权威数据来源，暂缓实现并待后续排期。

## Phase 1（W1–W6）：文字 RAG MVP

1. **基础设施**
   - 新建 GitHub Actions 工作流（lint/typecheck/test/build），补充 `.env.example`、本地运行指南。
   - 接入 OpenTelemetry、Sentry（留空 DSN），提供 `/healthz`、全局异常过滤、基于 Redis 的速率限制。
2. **AI Provider 抽象**
   - 在 `backend/src/ai` 实现 OpenAI 封装（`generateText`、`embed`），通过 `apps/common/config` 暴露配置。
3. **知识库管线**
   - 在 `scripts/` 添加语雀同步脚本：拉取 → 清洗 → 切分（200-400 tokens）→ 上传 PG+pgvector。
   - 采用 Prisma/Drizzle 管理数据库 schema，附带 `docker-compose`（Postgres + pgvector）供本地调试。
4. **Chat 模块**
   - 新建 `chat` 模块：检索-生成编排、引用溯源、SSE 输出；前端实现消息列表、引用展示、错误回退。
   - 构建黄金问答集，编写 Jest 集成测试 + Vitest 组件测试。

**交付标准**：`pnpm run check` 全绿，前端可与后端对话并展示引用，知识库完成首轮导入。

## Phase 2（W7–W12）：图像识别与循环统计

1. **图像接口**
   - 后端 `/api/v1/analyze/image` 支持 multipart 上传、临时存储、TTL 清理；前端实现拖拽上传 + 预览。
2. **OCR 与技能识别**
   - 抽象 OCR Provider（优先云 API，准备 Tesseract fallback），建立技能图标模板库 + Vision 兜底。
   - 输出结构化 `RotationStats`，关联知识库生成建议。
3. **循环分析展示**
   - Web 端渲染分析结果（关键动作、得分、建议牌），提供引用链接。
4. **质量保障**
   - 建立 30+ 截图回归集，集成测试覆盖核心路径；完善媒体上传安全策略（类型白名单、大小限制）。

**交付标准**：图片识别准确率 ≥90%，循环分析得分与基准对齐，CI 覆盖新增测试。

## Phase 3（W13–W16）：视频分析与高级能力

1. **异步任务流**
   - `/api/v1/analyze/video` 返回 `taskId`，Redis Streams Worker 执行 FFmpeg 抽帧、清洗、事件识别。
2. **时间轴分析引擎**
   - 构建循环模板对比、问题定位、建议生成；结果存储并附 TTL。
3. **前端报告**
   - 实现时间轴可视化、关键事件列表、报告导出；提供轮询或 SSE 推送更新。
4. **性能与风控**
   - 设定并发阈值、重试策略、成本监控；进行 2min/1080p 压测，确保 p95 < 5 分钟。

**交付标准**：视频任务闭环可用、评分准确度 ≥80%，监控报警上线。

## 横向工作流

- 文档：持续更新 `docs/` 下的 RFC、开发指南，并在 `README.md` 和 `AGENTS.md` 中保持链接同步。
- 安全合规：引入文件扫描、审计日志、速率限制、隐私声明。
- 可观测性：统一日志格式（JSON），定义指标命名规范（chat_latency、image_latency 等）。
- Milestone Review：分别在第 2、6、12 周进行范围检查，必要时调整后续迭代计划。
