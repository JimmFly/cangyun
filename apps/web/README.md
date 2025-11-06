# Cangyun Web Console

React 19 + Vite 应用，为 Cangyun 分山劲多模态战术台提供前端界面。当前版本聚焦 Phase 1 文字 RAG 能力：流式问答、引用展示与知识检索配置；后续将承载图像循环识别与视频分析入口。

## Tech Stack

- React 19 + `react-router@7` 提供极简导航骨架。
- Tailwind CSS + shadcn/ui components via the shared `@cangyun-ai/ui` package.
- SSE-based chat client parsing streamed deltas and source metadata.
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
- Use `streamChat` utility to interact with the backend SSE endpoint; it handles partial events, errors, and completion states.

## Testing & Linting

```bash
pnpm --filter web run lint       # ESLint + Prettier
pnpm --filter web run build      # Vite production build check
```

Add Vitest or Playwright suites under `src/features/*` as the UI surface evolves.

For architecture context and roadmap milestones, consult `docs/development-plan.md` and `docs/rfc-001-architecture-design.md`.
