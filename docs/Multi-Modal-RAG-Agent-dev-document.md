# Cangyun Multi-Modal RAG Agent 开发基准文档

## 1. 项目概述

### 1.1 项目背景

《剑网三》苍云门派的"分山劲"心法是一个复杂的外功近战输出套路，需要玩家掌握精细的技能循环和战斗策略。对于PVE玩家（尤其是新手）来说，掌握分山劲的技能机制和最佳输出循环具有相当挑战性。

### 1.2 项目目标与价值

**Cangyun RAG Agent** 是一个开源的多模态检索增强生成智能助手，专门为《剑网三》分山劲PVE玩家设计。

**核心价值**：

- **降低学习门槛**：通过权威攻略资料提供准确的问答服务
- **提升学习效率**：对话式交互替代繁琐的资料查阅
- **多模态互动**：支持图像和视频输入的直观指导
- **面向PVE定位**：专注副本玩家的循环优化和输出提升

### 1.3 核心技术 - RAG

检索增强生成(Retrieval-Augmented Generation)将大型语言模型与外部知识库结合，使助手能够提供基于最新游戏知识的准确答案，而非仅依赖AI的通用训练数据。

### 1.4 项目范围

**三阶段渐进式开发**：

- **Phase 1**：基于攻略站数据的文字问答系统
- **Phase 2**：图像识别与循环分析系统
- **Phase 3**：视频分析系统

### 1.5 目标用户

- **PVE新手玩家**：刚接触分山劲职业，需要快速上手指引
- **进阶PVE玩家**：希望优化输出循环、提升DPS表现
- **团队指挥**：需要快速查询职业机制和配置建议

## 2. 技术架构选型

### 2.1 前端技术栈

```typescript
// 核心技术选择
- React + TypeScript: 类型安全的现代前端开发
- Vite: 快速的构建工具和开发体验
- Tailwind CSS: 实用优先的CSS框架
- Shadcn/ui: 基于Tailwind的可定制UI组件
- Vercel AI SDK: 统一的AI功能开发接口
```

### 2.2 后端技术栈

```typescript
// 服务端架构
- NestJS: 企业级Node.js框架，支持TypeScript
- Vercel AI SDK: 多模型AI能力抽象层
- 向量数据库: Chroma/Pinecone + PostgreSQL pgvector (知识库检索)
- 关系数据库: PostgreSQL (用户数据存储)
- 缓存层: Redis (性能优化)
```

### 2.3 AI模型策略

**第一阶段**: OpenAI API (GPT-5, Embeddings, Vision)
**未来扩展**: DeepSeek及其他开源模型，降低成本并提升中文处理能力

## 3. 核心功能规划

### 3.1 PRD 1: 文字问答系统 (Phase 1)

#### 功能概述

为分山劲PVE玩家提供基于攻略站知识的精准文字问答服务。

#### 用户故事

- _作为分山劲新手玩家_，当我不清楚某个技能的作用时，我能直接询问AI并获得准确解答
- _作为希望提升DPS的玩家_，当我想优化输出循环时，我能获得基于攻略的专业建议
- _作为攻略维护者_，我希望AI的回答内容准确且引用官方攻略观点

#### 技术实现细节

```typescript
// 数据流设计
interface RAGProcess {
  queryEmbedding: number[];
  retrievedDocuments: DocumentChunk[];
  generatedPrompt: string;
  llmResponse: string;
}
```

#### 知识库管理

- 数据源: [语雀攻略站](https:////www.yuque.com/sgyxy/cangyun)
- 处理流程: 文档爬取 → 文本分块 → 向量化 → 元数据提取
- 更新机制: 每周自动同步更新

#### 验收标准

- 典型问题测试：预设常见问题回答与攻略内容相符
- 新手体验测试：新手玩家满意度 > 8/10
- 连贯对话测试：多轮提问保持上下文连贯

### 3.2 PRD 2: 图像识别系统 (Phase 2)

#### 功能概述

支持玩家上传游戏截图，识别技能图标、冷却状态、技能效果等信息。

#### 用户故事

- _作为忘记技能名称的新手_，我能通过截图询问技能信息
- _作为想改进输出的玩家_，我能上传伤害统计截图获得分析建议

#### 技术架构

```typescript
// 多模态处理流程
interface MultimodalAnalysis {
  extractedText: string[]; // OCR提取文本
  detectedSkills: SkillInfo[]; // 技能识别
  screenRegions: ScreenRegion[]; // 界面区域分析
  analysisResults: AnalysisResult[]; // 综合分析
}
```

#### 验收标准

- 技能图标识别正确率 > 90%
- 输出统计分析结论与人工分析一致率 > 80%
- 单张图片分析平均响应时间 < 5秒

### 3.3 PRD 3: 视频分析系统 (Phase 3)

#### 功能概述

通过战斗数据截图和视频分析分山劲输出循环质量，提供个性化优化建议。

#### 用户故事

- _作为想精进DPS的玩家_，我能上传战斗录像获得详细的操作分析
- _作为没有固定师父的新手_，我能通过视频分析自主获取专业指导

#### 分析引擎设计

```typescript
interface RotationAnalysis {
  score: number; // 综合评分
  issues: RotationIssue[]; // 发现问题
  recommendations: Recommendation[]; // 改进建议
  comparison: TemplateComparison; // 与标准模板对比
}
```

#### 验收标准

- 视频分析报告与资深玩家分析一致率 > 80%
- 2分钟1080p视频分析时间 < 5分钟
- 用户确认AI指出了他们没有意识到的问题

## 4. 系统架构设计

### 4.1 整体架构图

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   前端客户端    │────│    NestJS API     │────│    AI服务层     │
│                 │    │    网关层        │    │                 │
│ - React SPA     │    │ - 路由控制       │    │ - 向量检索      │
│ - TypeScript    │    │ - 认证授权       │    │ - LLM调用       │
│ - Tailwind CSS  │    │ - 数据验证       │    │ - 多模态处理    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                         │                         │
         │                         │                         │
         │                         │                         │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   用户交互层    │    │   业务逻辑层     │    │   数据持久层    │
│                 │    │                 │    │                 │
│ - 问题输入      │    │ - RAG引擎       │    │ - 向量数据库    │
│ - 文件上传      │    │ - 分析服务      │    │ - 关系数据库    │
│ - 结果展示      │    │ - 工作流编排    │    │ - 对象存储      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 4.2 核心服务设计

#### KnowledgeService (知识库服务)

```typescript
@Injectable()
export class KnowledgeService {
  async vectorizeText(text: string): Promise<number[]>;
  async retrieveRelevantChunks(
    query: string,
    limit: number
  ): Promise<DocumentChunk[]>;
  async updateKnowledgeBase(): Promise<void>;
  async semanticSearch(
    query: string,
    filters: SearchFilters
  ): Promise<SearchResult[]>;
}
```

#### AIService (AI能力抽象)

```typescript
@Injectable()
export class AIService {
  // 多提供商支持
  async generateAnswer(
    question: string,
    context: AnswerContext
  ): Promise<AnswerResponse>;
  async analyzeImage(
    image: Buffer,
    options: AnalysisOptions
  ): Promise<ImageAnalysis>;
  async processVideo(
    video: Buffer,
    options: VideoOptions
  ): Promise<VideoAnalysis>;

  // 提供商抽象
  private getProvider(providerType: AIProvider): BaseProvider;
}
```

### 4.3 API设计

#### 核心端点

```typescript
// 文字问答
POST /api/v1/chat
Request: { question: string, history?: MessageHistory[] }
Response: { answer: string, sources: DocumentSource[], confidence: number }

// 图像分析
POST /api/v1/analyze/image
Request: FormData { image: File, analysisType: 'skills' | 'ui' | 'rotation' }
Response: { analysis: ImageAnalysis, suggestions: Suggestion[] }

// 视频分析
POST /api/v1/analyze/video
Request: FormData { video: File, options: VideoOptions }
Response: { analysis: VideoAnalysis, timeline: TimelineEvent[] }
```

## 5. 开发实施计划

### 5.1 Phase 1: 基础框架与文字RAG (第1-6周)

#### 第1-2周: 项目初始化

```typescript
// 任务清单
- [ ] Monorepo项目结构搭建
- [ ] 前端: React + Vite + Tailwind基础配置
- [ ] 后端: NestJS项目初始化 + 基础模块
- [ ] 开发环境: Docker + CI/CD流水线配置
- [ ] 代码质量: OXLint快速检查 + ESLint兜底 +  Prettier + Husky配置
```

#### 第3-4周: 知识库系统

```typescript
// 核心功能
- [ ] 语雀API数据获取模块
- [ ] 文档解析和分块逻辑
- [ ] OpenAI Embeddings集成
- [ ] 向量检索服务实现
- [ ] 知识库更新机制
```

#### 第5-6周: 基础问答系统

```typescript
// 功能开发
- [ ] NestJS聊天端点实现
- [ ] RAG引擎核心逻辑
- [ ] 流式响应支持
- [ ] 前端聊天界面
- [ ] 基础测试和部署
```

**MVP验收标准**：

- 用户能够通过网页与AI自由对话
- RAG流程准确有效，回答涵盖攻略知识点
- 无明显错误回答

### 5.2 Phase 2: 多模态扩展 (第7-12周)

#### 第7-8周: 图像识别系统

```typescript
// 图像处理能力
- [ ] 图像上传和预处理服务
- [ ] GPT-4 Vision API集成
- [ ] 技能图标识别算法
- [ ] 界面元素检测
- [ ] 图像分析结果展示
```

#### 第9-10周: 循环分析引擎

```typescript
// 分析功能
- [ ] 战斗数据解析器
- [ ] 循环质量评估算法
- [ ] 个性化建议生成
- [ ] 数据可视化组件
```

#### 第11-12周: 系统集成优化

```typescript
// 系统完善
- [ ] 用户会话管理
- [ ] 缓存策略优化
- [ ] 错误处理完善
- [ ] 性能监控集成
```

**阶段验收标准**：

- 成功识别常见技能图标
- 输出统计截图分析准确
- 用户反馈积极

### 5.3 Phase 3: 高级功能 (第13-16周)

#### 第13-14周: 视频分析系统

```typescript
// 视频处理
- [ ] 视频上传和帧提取
- [ ] 时间线分析引擎
- [ ] 技能序列识别
- [ ] 视频分析报告生成
```

#### 第15-16周: 生产就绪

```typescript
// 生产部署
- [ ] 安全审计和加固
- [ ] 性能负载测试
- [ ] 监控告警系统
- [ ] 文档完善
```

## 6. 风险分析与应对策略

### 6.1 技术风险

#### AI模型依赖风险

- **风险**: 过度依赖OpenAI API，存在成本和服务稳定性风险
- **应对**:
  - 多提供商抽象层设计
  - DeepSeek等开源模型备用方案
  - 请求限流和缓存策略

#### 多模态识别准确率

- **风险**: 图像/视频识别准确率不足影响用户体验
- **应对**:
  - 多算法融合策略（OCR + 模板匹配 + AI识别）
  - 置信度阈值设置
  - 人工审核降级机制

### 6.2 业务风险

#### 游戏版本更新

- **风险**: 游戏内容更新导致知识库过时
- **应对**:
  - 自动化知识库更新管道
  - 版本兼容性检测
  - 社区贡献机制

#### AI错误与幻觉

- **风险**: LLM产生不准确或编造信息
- **应对**:
  - 严格的提示词工程
  - 知识库范围限制
  - 用户反馈和纠错机制

### 6.3 实施风险

#### 开发复杂度

- **风险**: 多模态功能开发复杂度超出预期
- **应对**:
  - 模块化开发策略
  - 原型验证优先
  - 技术债务管理

## 7. 成功指标与验收标准

### 7.1 技术性能指标

```typescript
const SuccessMetrics = {
  // 响应性能
  textResponseTime: '< 3秒',
  imageAnalysisTime: '< 10秒',
  videoProcessingTime: '< 5分钟',

  // 准确率指标
  answerAccuracy: '> 85%',
  imageRecognitionAccuracy: '> 90%',
  userSatisfaction: '> 4.5/5.0',

  // 可靠性指标
  systemAvailability: '> 99.5%',
  errorRate: '< 1%',
};
```

### 7.2 业务指标

- 月活跃用户增长率 > 20%
- 核心功能使用率 > 70%
- 用户平均会话时长 > 5分钟
- 用户推荐意愿(NPS) > 30

## 8. 假设与依赖

### 8.1 技术依赖

- 语雀API稳定可用或攻略内容可导出
- OpenAI GPT-4 API服务稳定
- 网络环境支持大文件上传

### 8.2 业务假设

- 攻略知识库内容完整可靠
- 用户具有基本的游戏理解能力
- 游戏UI界面相对稳定

## 9. 未来扩展规划

### 9.1 功能扩展

- 移动端应用（React Native）
- 实时游戏数据集成
- 社区内容分享功能
- 机器学习个性化推荐

### 9.2 技术演进

- 专用小模型fine-tuning
- 边缘计算分流
- 多云架构保障
- AIOps智能化运维

---

## 文档总结

本开发基准文档融合了两份原始文档的优势，提供了：

1. **完整的技术架构** - 详细的服务设计和API规范
2. **渐进式实施计划** - 清晰的阶段划分和可执行任务
3. **全面的质量保障** - 量化的技术指标和验收标准
4. **务实的风险管理** - 技术、业务、实施多维度风险控制
5. **用户导向的设计** - 丰富的用户故事和场景描述

此文档可作为团队开发的统一基准，确保技术实施与产品目标的一致性。
