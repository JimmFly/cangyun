# Cangyun Multi-Modal RAG Agent 开发计划

## 当前状态概览

- Monorepo 结构、Husky、ESLint、Prettier 与 `pnpm` workspace 均已落地，`pnpm run dev` 可以同时启动 web 与 backend；型别配置统一在根 `tsconfig`。
- 后端完成 `AppConfigModule`、`AiModule`、`KnowledgeModule`、`ChatModule`、`GuideModule` 与 `CangyunModule` 的串联，SSE `/api/v1/chat` 正在提供问答能力，并根据配置调用外部攻略站工具。
- 前端 `apps/web` 的 `ChatRoute` 通过自定义 `CustomChatTransport` 解析 SSE，包含 topK 选择、引用面板、流式状态与 `stop()` 中断。
- 知识摄取脚本（Yuque 抓取 + Markdown 导入）已能输出结构化 Markdown、表格截图/OCR，并用 `pnpm run ingest:markdown` 自动切块、写入 `/api/v1/knowledge/documents`。

## 进度更新（近期）

- 新增 `GuideModule` + `CangyunModule`：后端会在聊天流中暴露 `fetch_current_season_guide`、`cangyun_search`、`cangyun_fetch_page` 工具，使用 Perplexity 将搜索限定在 `GUIDE_BASE_URL` / 语雀苍云 / 剑三魔盒 / 每日攻略域名，并缓存 30 分钟。
- `ChatService` 增强检索：根据“山海源流”“弓月城”等关键词扩充 query，汇总历史、限制工具调用轮次，并在系统提示中写入最新赛季、怒气与填充技能背景。
- Web 端切换自定义 `CustomChatTransport`，统一处理 SSE `sources/delta/error` 事件，提供 topK 下拉、流式状态提示与停止按钮，引用面板实时从 transport 获取 Source 列表。
- `scripts/knowledge/ingest-yuque.ts` 捕获 sheet API 响应、写入 frontmatter、对 Canvas 表格截图 + OCR；`scripts/knowledge/ingest-markdown.ts` 负责规范 Markdown、切 chunk、分批调用 `/api/v1/knowledge/documents` 并透出导入进度。
- `.env.example`、配置模块与 README 系统化记录了 `GUIDE_*`、`PERPLEXITY_API_KEY`、S3/OCR 等变量，zod 校验会在缺失关键凭证时立即终止。
- Docker Compose（pgvector + Redis）、DatabaseModule、Vercel AI SDK provider 已可用；CI/CD、`/healthz`、全局异常过滤、速率限制仍待实现。
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
