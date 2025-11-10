# 代码库优化评审（中文版）

## 后端

### `/api/v1/chat` 缺少运行时校验

- **证据：** `backend/src/chat/dto/chat-request.dto.ts:1-12` 仅声明 TypeScript 接口，而 `backend/src/chat/chat.controller.ts:22-53` 在没有任何 Nest `ValidationPipe` 或 schema 校验的情况下直接消费 `@Body()`；`backend/src/main.ts:8-70` 同样未安装全局校验管道。
- **影响：** 请求可在缺少 `question`、`topK` 为负、`history` 格式错误的情况下进入多 Agent 逻辑，这与“Schema everywhere”准则相悖，错误处理也会变得不可预测。
- **建议：** 使用 Zod（可放在 `apps/common/types`）配合自定义校验管道，或改用 `class-validator` 并在 bootstrap 时启用 `app.useGlobalPipes(new ValidationPipe({ whitelist: true }))`，确保每个聊天请求在到达业务逻辑前完成清洗。

### SSE 协议缺少共享类型

- **证据：** `backend/src/chat/chat.controller.ts:37-158` 通过字符串字面量构造 `'status'`、`'sources'`、`'delta'`、`'done'`、`'error'` 等事件；前端在 `apps/web/src/features/chat/utils/custom-chat-transport.ts:133-199` 再次手动解析同样的字符串。
- **影响：** 协议完全靠字符串约定，前后端任一侧变更都会悄悄破坏兼容性，TypeScript 也无法提供帮助。
- **建议：** 在 `apps/common/types` 定义 SSE 事件联合类型（或 Zod schema），后端控制器输出时复用，前端 transport 解析时引用，保证编译期和测试期都能发现协议漂移。

### Postgres 仓储中向量序列化不安全

- **证据：** `backend/src/knowledge/postgres-knowledge.repository.ts:113-155` 将 `embeddingSql` 插入 SQL 字符串而非使用参数占位符。
- **影响：** 尽管 embedding 是数字数组，但字符串拼接绕过了 pg 的参数化防护，易产生格式错误，也阻碍未来对 `pgvector` 等存储方案的替换。
- **建议：** 通过 `$6::vector` 之类的参数占位符写入向量（`pgvector` 支持直接传递数值数组），或使用 `pg-format` 等安全拼接工具，避免手写 SQL 片段。

### 多 Agent 协调缺少针对性测试

- **证据：** `backend/src/chat/chat.service.ts:41-222` 实现了可重试的多 Agent 流式逻辑，但 `backend/src/chat/` 下没有任何 `*.spec.ts`（仅根目录存在 `app.controller.spec.ts`）。
- **影响：** 状态事件、可恢复流、fallback 逻辑都无法做回归测试，真正发现问题只能等到线上。
- **建议：** 在 `chat.service.ts` 附近添加 Jest 测试，stub 出 `KnowledgeAgentService`、`ExternalAgentService`、`CoordinatorAgentService`，分别验证成功、失败与续写场景，并捕获 SSE 输出以校验协议。

## 前端

### 附件链路不完整

- **证据：** `apps/web/src/components/ai-elements/prompt-input.tsx:455-714` 负责采集附件、转换 blob URL，并通过 `PromptInput` 的 `onSubmit` 传出。但 `apps/web/src/features/chat/routes/ChatRoute.tsx:206-214` 完全忽略 `_message` 参数，而 `apps/web/src/features/chat/utils/custom-chat-transport.ts:40-58` 在构造 payload 时仅拼接文本。后端 `ChatRequestDto` 也没有附件字段。
- **影响：** UI 看似支持文件上传，实际上任何附件都会被静默丢弃，浪费用户操作和前端逻辑。
- **建议：** 确定附件格式（例如 base64 + 元数据），在前端 transport 与后端 DTO 之间共享类型；`ChatRoute` 发送消息时要传入 `PromptInputMessage` 的完整内容。

### `PromptInput` 体积过大且含 `any`

- **证据：** `apps/web/src/components/ai-elements/prompt-input.tsx:1-1140` 将 Provider、拖拽、文件操作、键盘处理、语音识别全部堆在同一文件；`apps/web/src/components/ai-elements/prompt-input.tsx:1084-1097` 自定义的 `SpeechRecognition` 接口使用 `any`。
- **影响：** 组件难以测试，也难以局部修改；`any` 破坏 TypeScript 安全性，与仓库“禁止使用 any”的要求冲突。
- **建议：** 将 Provider / 附件列表 / 语音按钮 / 表单壳拆分为多个模块，语音识别则直接复用 DOM lib 的类型声明或第三方类型定义，并为该包开启 `no-explicit-any`。

### 聊天状态冗余且错误类型宽松

- **证据：** `apps/web/src/features/chat/routes/ChatRoute.tsx:64-159` 维护了自定义 `pending` 状态并用 `setTimeout` 模拟 `useChat` 的状态流；`apps/web/src/features/chat/routes/ChatRoute.tsx:161-182` 将 `parts` 强转为 `{ type?: string; errorText?: unknown }` 以探测错误。
- **影响：** 与 SDK 状态重复，容易出现竞态；大量类型断言让错误处理变成“非类型安全”。
- **建议：** 直接依赖 `useChat` 返回的 `status`、`error` 驱动 UI，移除手写的 `pending` 状态机，同时基于前后端共享的 SSE 类型处理错误 part。

### Transport 丢弃结构化历史

- **证据：** `apps/web/src/features/chat/utils/custom-chat-transport.ts:33-69` 仅拼接每条消息的文本部分，忽略非文本 part 或工具调用，最后发送 `{ question, history, topK }`。
- **影响：** 工具输出、引用、未来的多模态内容都无法送达后端，也无法还原上下文；附件实现后同样会丢失。
- **建议：** 直接发送完整的 `UIMessage` 数组（或统一 DTO），由后端派生 `question`、工具调用及附件信息，让 transport 变得薄而可靠。

## 工具 / 脚本

### `scripts/knowledge/ingest-yuque.ts` 依赖 `any` 和无类型递归

- **证据：** `scripts/knowledge/ingest-yuque.ts:86-109` 的 `responseListener`、`scripts/knowledge/ingest-yuque.ts:758-865` 的表格解析、`scripts/knowledge/ingest-yuque.ts:989-1053` 的 OCR 启动都使用 `any`。
- **影响：** 抓取流水线无法借助 TypeScript 提前发现问题；一旦遇到不符合预期的 DOM/JSON 结构就会在运行末尾崩溃，也违反仓库的 TypeScript 要求。
- **建议：** 将表格解析、OCR 等逻辑拆分到独立、具备类型定义的 helper 中（例如 `SheetParser`, `OcrClient`），用 Zod 建模语雀响应，并在 `scripts/knowledge/__tests__` 里为这些 helper 补充 Vitest/Jest 单测，避免每次调试都必须跑一次 Playwright。
