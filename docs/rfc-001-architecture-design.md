# RFC-0001：Cangyun Multi-Modal RAG Agent 架构设计

**状态**：提议（Proposed）
**作者**：@JimmFly（Owner），@contributors
**仓库**：`https://github.com/JimmFly/cangyun`
**审阅截止**：2025-11-12 (Asia/Singapore)
**适用范围**：Phase 1（文字 RAG）、Phase 2（图像）、Phase 3（视频）
**依赖文档**：开发基准文档 v1（你提供的全文）

---

## 1. 摘要

本 RFC 定义 Cangyun 的端到端技术架构、边界与接口：前端（React+Vite+Tailwind+shadcn/ui）、后端（NestJS）、AI 能力接入（Vercel AI SDK / OpenAI，后续兼容 DeepSeek）、数据层（pgvector/向量库、PostgreSQL、Redis）、以及多模态处理（OCR/视觉/视频管线）。目标是在 **Phase 1** 交付稳定、低延迟、可复用的文字 RAG 能力，并在 **Phase 2/3** 以最小重构增量扩展图像/视频分析。

---

## 2. 目标 & 非目标

### 2.1 目标

- 构建一套 **模块化** 的 RAG 应用骨架：**知识摄取 → 检索 → 生成 → 评估**。
- **强约束** 的提示工程与引用溯源，降低幻觉率，保证对齐语雀攻略。
- 前后端 **类型统一（TypeScript）**、**流式响应**、**可观测性** 与 **SLO** 可量化。
- 为 **图像/视频** 管线预留明确扩展点（不阻塞 Phase 1 上线）。

### 2.2 非目标

- 不做任何形式的**游戏内自动化/外挂**。
- 不追求离线本地大模型推理（可作为未来 ADR）。
- 不在 Phase 1 引入复杂的用户体系与计费（仅最小态会话）。

---

## 3. 架构总览

```
┌────────────────── Frontend (Vite SPA) ──────────────────┐
│  React + TS + Tailwind + shadcn/ui                      │
│  - Chat UI（文本/图片/视频上传）                         │
│  - SSE/流式渲染                                          │
│  - 状态管理（轻量）                                      │
└───────────────▲───────────────┬───────────────▲──────────┘
                │               │               │
        HTTPS/JSON        HTTPS/FormData      HTTPS/SSE
                │               │               │
┌───────────────┴───────────────┼───────────────┴──────────┐
│                  Backend (NestJS API)                     │
│  Modules:                                                 │
│   - chat (RAG/Prompt Orchestrator, streaming)             │
│   - knowledge (ingest/index/search, Yuque sync)           │
│   - mm-image (OCR + Vision 识别)                          │
│   - mm-video (帧抽取 + 时序分析 + 任务队列)                │
│   - ai (provider 抽象：OpenAI/DeepSeek)                   │
│   - infra (auth, rate limit, cache, health, telemetry)    │
└───────────────┬───────────────┼───────────────┬──────────┘
                │               │               │
         Vector Search      Relational DB      Cache/Queue
                │               │               │
        ┌───────▼───────┐ ┌─────▼─────┐  ┌─────▼──────┐
        │ pgvector/pine │ │PostgreSQL │  │ Redis/KV   │
        │  文档嵌入检索 │ │会话/任务等│  │ 缓存/队列   │
        └───────────────┘ └───────────┘  └─────────────┘

              ┌──────────────────────────┐
              │    AI Providers via      │
              │    Vercel AI SDK         │
              │  - OpenAI (GPT, Vision)  │
              │  - DeepSeek (future)     │
              └──────────────────────────┘
```

---

## 4. 关键设计决策（ADR 摘要）

1. **RAG 检索层：pgvector on Postgres（优先）**
   - _理由_：易托管、事务一致、与关系数据共库；Phase 1 足够。
   - _替代_：Pinecone/Chroma（作为可插拔驱动，保持 `IKnowledgeIndex` 接口稳定）。

2. **AI SDK 统一抽象**
   - _理由_：隐藏 OpenAI/DeepSeek 差异，简化切换与多模态调用。
   - `AIService` 提供 `generateText`, `visionAnalyze`, `embed` 三大基元。

3. **SSE 流式输出**
   - _理由_：缩短 TTFB、提升交互感知。
   - NestJS 端提供 `text/event-stream`，对齐前端渲染。

4. **视频分析采用“任务队列 + 异步结果查询”**（Phase 3）
   - _理由_：处理重、时长不确定；通过 `taskId` 轮询/回推。
   - 队列采用 Redis Stream（或 KV+轮询，Vercel 环境下可替代）。

5. **最小权限 & 零持久化媒体**
   - _理由_：降低隐私风险，图片/视频默认临时存储，处理后即删。
   - 可选对象存储（S3 兼容）仅在视频分析需要时启用。

---

## 5. 模块设计

### 5.1 chat 模块（Phase 1 核心）

职责：RAG 编排、提示模板化、流式对话。

- **主要流程**
  1. `embed(query)` → `vectorSearch(topK)` → 取回 `DocumentChunk[]`
  2. 构建系统/用户/上下文消息（严格“仅据所给内容回答”）
  3. `generateText(stream: true)` → SSE 推送到前端
  4. 生成引用（source 高亮）与置信度估计（BM25/密集检索融合得分简化估）

- **接口**

  ```ts
  POST /api/v1/chat
  body: { question: string; history?: ChatTurn[]; options?: { topK?: number } }
  resp:  SSE stream → { delta: string } … [DONE]
  ```

- **提示模板（要点）**
  - 角色：分山劲 PVE 助手；禁止超范围回答；必须引用来源标题/段落锚点。
  - 风格：简洁分点、先结论后理由；涉及循环给优先级与时机解释。

### 5.2 knowledge 模块（摄取/索引/检索）

职责：对接语雀、分块、嵌入、写入 pgvector，定期同步。

- **摄取管线**
  - `yuque.fetch()` → `md/section split(≈200-400 tokens)` → `normalize(meta)`
  - `embed(text)` → `INSERT (id, text, embedding, meta)`
  - `upsert` 与 `deletedAt` 标记支持回滚版本

- **检索**
  - `dense (cosine)` ± `sparse (BM25)` 融合（可选），topK 默认 6
  - 过滤：`{category, gameVersion}`

- **接口**

  ```ts
  interface IKnowledgeIndex {
    ingest(docs: DocInput[]): Promise<void>;
    search(q: string, k: number, filters?: Filters): Promise<SearchHit[]>;
    refreshFromYuque(): Promise<SyncReport>;
  }
  ```

### 5.3 mm-image 模块（Phase 2）

职责：OCR、技能图标识别、统计面板解析、图像问答（Vision）。

- **策略**
  - OCR：优先云 OCR（延迟/准确折中），备选 Tesseract（轻量）。
  - 图标识别：三段式回退 → 模板/特征匹配 → Vision → 人类可读不确定列表。
  - 输出统计：版式感知 + OCR 表格抽取 → `RotationStats` JSON → 分析器。

- **接口**

  ```ts
  POST /api/v1/analyze/image
  form: { image: File; type: 'skill'|'stats'|'ui' }
  resp: { analysis: ImageAnalysis; suggestions?: Suggestion[]; sources?: Source[] }
  ```

### 5.4 mm-video 模块（Phase 3）

职责：视频上传 → 帧抽取/采样 → OCR/识别 → 时序重构 → 循环比对 → 报告。

- **任务流**
  - `POST /analyze/video` → 返回 `taskId`
  - Worker：FFmpeg 抽帧（e.g., 2fps 可配）→ 关键区域裁切 → OCR/识别 → 事件序列
  - 比对引擎：理想循环模板（冷却/窗/姿态） vs. 实际序列 → 差异列表
  - 结果存储：`video_analysis_result`（TTL）
  - `GET /analyze/video?taskId=...` 拉取报告

- **接口**

  ```ts
  POST /api/v1/analyze/video  // 202 响应 { taskId }
  GET  /api/v1/analyze/video?taskId=xxx
  ```

### 5.5 ai 模块（Provider 抽象）

职责：统一封装 AI SDK，支持 OpenAI（首选）与 DeepSeek（未来）。当前实现落地在 Vercel AI SDK（`ai` + `@ai-sdk/openai`），负责处理流式文本、向量生成与未来模型切换。

```ts
interface AIProvider {
  embed(texts: string[]): Promise<number[][]>;
  generateText(
    input: ChatInput,
    opts?: { stream?: boolean }
  ): AsyncIterable<string> | string;
  visionAnalyze(image: Buffer, prompt: string): Promise<string>;
}

@Injectable()
class AIService {
  constructor(private readonly provider: AIProvider) {}
  // Facade：chat/knowledge/mm-* 统一通过本服务调用
}
```

### 5.6 infra 模块

- **Auth**：Phase 1 仅匿名/轻鉴权（防滥用：API Key + Rate Limit）。
- **Rate Limit**：令牌桶（IP/匿名 Session）+ “模型调用”粒度熔断。
- **Cache**：QA 结果缓存（key: normalized question + indexVersion）。
- **Health**：`/healthz`（DB/向量/AI Provider 探针）。
- **Telemetry**：请求计数、延迟、模型 token、检索命中率、错误率。

---

## 6. 数据模型（核心表/对象）

> 实际实现以 Prisma/Drizzle 等 ORM 为准，以下作类型说明。

```ts
// 知识切片（pg + pgvector）
type DocChunk = {
  id: string;
  docId: string;
  title: string;
  content: string;
  embedding: number[]; // pgvector
  meta: {
    category?: string;
    gameVersion?: string;
    url?: string;
    anchor?: string;
  };
  createdAt: Date;
  updatedAt: Date;
};

// 简易会话（Phase 1 可选）
type ChatSession = {
  id: string;
  createdAt: Date;
  lastActiveAt: Date;
  turns: { role: 'user' | 'assistant'; content: string }[];
};

// 图像/视频任务（Phase 2/3）
type MediaTask = {
  id: string;
  type: 'image' | 'video';
  status: 'queued' | 'processing' | 'done' | 'error';
  inputUri: string; // 临时对象存储 / 预签名
  output?: any; // 结构化结果
  error?: string;
  createdAt: Date;
  updatedAt: Date;
};

// 循环统计（图片/视频归一）
type RotationStats = {
  skills: Array<{ name: string; count?: number; dpsShare?: number }>;
  durationSec?: number;
};

type RotationAnalysis = {
  score: number;
  issues: Array<{ code: string; message: string; at?: number }>;
  recommendations: string[];
  sources?: Source[];
};
```

---

## 7. API 契约（V1）

### 7.1 Chat（RAG）

- `POST /api/v1/chat` → **SSE**
  - **Req**：`{ question, history? }`
  - **Event**：`data: {"delta":"..."}\n\n`，结束发送 `data: [DONE]`
  - **Headers**：`Accept: text/event-stream`
  - **错误**：`event: error` + `data: {"code":"RATE_LIMIT","msg":"..."}`

### 7.2 Image

- `POST /api/v1/analyze/image`
  - **Form**：`image`、`analysisType: 'skill'|'stats'|'ui'`
  - **Resp**：

    ```json
    {
      "analysis": { "detectedSkills":[...], "extractedText":[...] },
      "suggestions": ["..."],
      "sources":[{"title":"...","url":"...","anchor":"..."}]
    }
    ```

### 7.3 Video

- `POST /api/v1/analyze/video` → `202 { taskId }`
- `GET  /api/v1/analyze/video?taskId=...` →

  ```json
  { "status":"processing"|"done"|"error", "result": { "report":"...", "timeline":[...] } }
  ```

> **速率限制（建议）**：
>
> - Chat：每 IP 每分钟 20 次
> - Image：每 IP 每 10 分钟 10 次
> - Video：每 IP 每天 5 次

---

## 8. 运行与部署

- **前端**：Vercel（静态 + Edge 中间层可选）；环境变量注入 `VITE_API_BASE_URL`。
- **后端**：Vercel Serverless Functions / Railway（长期运行任务友好）。
- **DB**：Supabase（Postgres + pgvector）或 Vercel Postgres + 外挂向量；
- **缓存/队列**：Upstash Redis（Serverless 友好）。
- **对象存储**（可选）：S3 兼容（R2/MinIO），视频临时存取。

**环境变量（最小集）**

```
OPENAI_API_KEY=...
AI_PROVIDER=openai|deepseek
DATABASE_URL=postgres://...
REDIS_URL=...
S3_ENDPOINT=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
YUQUE_TOKEN=...
```

---

## 9. 安全与合规

- **最小化数据驻留**：媒体默认处理后删除；日志脱敏。
- **域内回答约束**：严格提示与 RAG，上下文不包含时，要求回答“未知/请参考链接”。
- **版权**：标注语雀来源链接与章节锚点；遵循内容使用协议。
- **滥用防护**：人机校验（Turnstile/Recaptcha）、速率限制、审计日志。
- **依赖安全**：CI 引入 `pnpm audit`/`oxlint`，Dependabot 升级。

---

## 10. 可观测性 & SLO

- **指标**
  - `chat_latency_p50/p95`，目标 `<1.5s / <3s`
  - `image_latency_p95` `<5s`
  - `video_total_time_p95` `<5min`
  - `answer_accuracy_est`（人工对照集/定期评测）`>85%`
  - `image_recog_acc` `>90%`

- **Tracing/Logging**：OpenTelemetry（HTTP span + provider 调用），Sentry（错误聚合）。
- **红线**：`5xx_rate < 1%`，AI provider 错误自动降级/重试（指数退避）。

---

## 11. 性能与成本优化

- **检索缓存**：`(normalized_question, index_version) → hits` 5~15 分钟 TTL
- **答案缓存**：热门问答直接复用（携带来源与生成时间）
- **Chunk 策略**：200~400 token，带标题/小节上下文；多粒度检索（段+小节）
- **流式优先**：降低主观等待
- **多模态成本**：Image/Video 仅在用户显式触发；大文件限额 + 并发阈值

---

## 12. 风险与缓解

- **Provider 风险**（限额/中断）→ 多提供商抽象、重试与降级（返回“仅基于检索片段的非生成答案”）。
- **OCR/识别不准** → 可信度阈值 + “不确定候选”回传 + 让用户点选确认。
- **游戏版本飘移** → Yuque 周期同步 + `gameVersion` 字段标注；提示中声明版本日期。
- **Serverless 超时** → 视频分析异步化；必要时落地常驻执行环境（Railway/Cloud Run）。

---

## 13. 推广路线 & 里程碑（与基准文档对齐）

- **M1（~第 6 周）**：RAG Chat（SSE）、pgvector、Yuque 同步、部署/监控
- **M2（~第 12 周）**：Image（OCR/技能识别/输出面板解析）、循环分析器 1.0
- **M3（~第 16 周）**：Video（队列/帧抽取/时序报告）、性能与安全加固

---

## 14. 开放问题（需评审共识）

1. pgvector vs Pinecone：生产是否直接托管外部向量库以便扩容？
2. OCR 选型：先云服务还是先本地 Tesseract？（准确率 vs 成本）
3. Vision 接入：GPT-4V 的配额与费用可接受阈值？是否需要开关与配额管理？
4. 视频并发上限与公平队列策略。
5. Prompt 模板是否允许“轻自我纠错”（让模型指出不确定项）？

---

## 15. 附录：关键类型与伪码

```ts
// Chat 编排（简化）
async function answer(question: string, history: Turn[]) {
  const hits = await index.search(question, 6, { category: 'rotation|skills' });
  const ctx = hits.map(h => `【${h.meta.title}】${h.content}`).join('\n---\n');
  const sys = `你是分山劲PVE助手。仅根据提供的资料作答，无法确定时请说未知并给出处。`;
  const user = `问题：${question}\n\n资料：\n${ctx}`;

  return ai.generateText(
    { system: sys, messages: [{ role: 'user', content: user }] },
    { stream: true }
  );
}
```

```ts
// 输出统计解析到建议（Image → Analysis）
function analyzeStats(
  stats: RotationStats,
  ideal: IdealProfile
): RotationAnalysis {
  const issues = [];
  // 示例规则：主技能占比过低
  for (const s of ideal.keySkills) {
    const cur = stats.skills.find(x => x.name === s.name)?.dpsShare ?? 0;
    if (cur < s.minShare)
      issues.push({
        code: `LOW_SHARE_${s.name}`,
        message: `${s.name} 占比偏低（${cur}% < ${s.minShare}%）`,
      });
  }
  const score = Math.max(0, 100 - issues.length * 8);
  return {
    score,
    issues,
    recommendations: generateTips(issues),
    sources: ideal.sources,
  };
}
```

---

### 结论

本架构在 **简单可实现** 与 **可持续扩展** 之间做了平衡：Phase 1 以 pgvector + SSE 的 RAG 核心快速上线；Phase 2/3 在不破坏核心编排的前提下增量加入 OCR/视觉/视频任务流。通过 **AI Provider 抽象、数据/接口稳定层、可观测性与成本控制**，能确保项目对外稳健、对内可演进。请评审以上 ADR、接口与里程碑安排并提出修改意见。
