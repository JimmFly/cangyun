# Cangyun Web Console

React 19 + Vite 应用，为 Cangyun 分山劲多模态战术台提供前端界面。当前版本聚焦 Phase 1 文字 RAG 能力：流式问答、引用展示与知识检索配置；后续将承载图像循环识别与视频分析入口。

## Tech Stack

- React 19 + `react-router@7` 提供极简导航骨架。
- Tailwind CSS + shadcn/ui components via the shared `@cangyun-ai/ui` package.
- 自定义 `CustomChatTransport`（封装于 `features/chat/utils`）桥接 Vercel AI SDK 的 `useChat` 与后端 SSE，统一 sources/delta 事件解析与错误处理。
- TypeScript path aliases defined in `tsconfig.base.json`.

## Getting Started

```bash
# From the repository root
pnpm install
pnpm run build:common  # build shared packages

# Dev server (served on Vite default port 5173, proxied to backend for /api)
pnpm run dev:web
```

The Vite config proxies `/api` to `http://localhost:3000`, so start the backend (`pnpm run dev:backend`) in parallel.

## Available Routes

- `/` – Landing view describing the console and linking to documentation.
- `/chat` – Streaming chat assistant with adjustable `topK` controls, citation list, and SSE status feedback.
- `*` – Friendly 404 page via `NotFoundRoute`.

## Chat Capabilities

- 通过检索片段选择器在 3/6/8/10 之间切换，并随请求传递到后端。
- `CustomChatTransport` 把 `sources` 事件写入本地状态，引用面板可直接从 SSE 获得最新来源。
- `useChat` 的 `status` 辅助文案（“发送中…”/“生成中…”），并支持 `stop()` 立即中断 SSE。
- 错误消息由 transport 统一解析，展示请求 ID 以便排查。

## Project Structure

```
src/
  app/           // Router, layout, and shared route wiring
  features/
    chat/        // ChatRoute, MessageBubble, SSE client utilities, types
    home/        // Marketing / hero content for the console entry
  assets/        // Static assets
```

## Development Guidelines

- Follow the patterns documented in `AGENTS.md` (React: derive data in render, keep effects for external sync only).
- Shared UI components live in `@cangyun-ai/ui`; avoid local duplicates unless prototyping.
- 通过 `CustomChatTransport` 接入后端 SSE；如需调试可以在 `features/chat/utils/custom-chat-transport.ts` 中扩展日志或错误上报。

## Testing & Linting

```bash
pnpm --filter web run lint       # ESLint + Prettier
pnpm --filter web run build      # Vite production build check
```

Add Vitest or Playwright suites under `src/features/*` as the UI surface evolves.

For architecture context and roadmap milestones, consult `docs/development-plan.md` and `docs/rfc-001-architecture-design.md`.
