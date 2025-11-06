# Repository Guidelines

## Project Structure & Module Organization

The pnpm workspace is split into a React frontend in `apps/web`, shared UI and utility packages under `apps/common/*` (published internally as `@cangyun-ai/*`), and a NestJS API in `backend`. Docs and design notes live in `docs/`, including the active roadmap in `docs/development-plan.md`. TypeScript configs sit at the repo root. Keep web-facing assets inside `apps/web/src/assets`, and colocate feature tests next to the code they verify (`*.spec.ts` in `backend/src`, Storybook stories or Vitest specs inside component folders). Utility scripts live under `scripts/`, e.g. `scripts/knowledge/ingest-yuque.ts` produces chunked knowledge JSON for ingestion.

## Build, Test, and Development Commands

- `pnpm run setup` – install dependencies and prime every shared package build.
- `pnpm run dev` – start the web client and backend together with prefixed logs.
- `pnpm run typecheck` / `pnpm run lint` / `pnpm run test` – run the TypeScript project references, ESLint+Prettier checks, and backend Jest suite respectively.
- `pnpm run build` – produce production bundles (shared packages → web → backend).
  Use `pnpm --filter <workspace>` to scope commands when iterating on a single package.

## Coding Style & Naming Conventions

Prettier (root `.prettierrc`) enforces 2-space indentation, single quotes, and minimal arrow parentheses; the backend override keeps trailing commas. ESLint is configured via `eslint.config.mjs` with React, Hooks, and import sorting rules—run `pnpm run lint:fix` before pushing. Prefer PascalCase for React components, camelCase for utilities, and keep filenames lower-hyphen for shared packages (`apps/common/router`). Import shared code through the `@cangyun-ai/*` aliases instead of relative paths. When working in React, follow [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect): derive data within render, move logic to event handlers or custom hooks, and only use `useEffect` when syncing with external systems.
关于typescript，需要参考 typescript 最佳实践，禁止使用any。

## Testing Guidelines

The backend relies on Jest with `*.spec.ts` files and coverage output in `backend/coverage`; aim to maintain coverage at or above current levels by running `pnpm --filter cangyun-backend run test:cov` before merging. Frontend behavior should be captured with component-level tests (Vitest/Testing Library) or Storybook stories adjacent to the component. Document any new mocks in `apps/common/test-utils`. CI hooks run `pnpm run check`, so ensure it passes locally.

## Commit & Pull Request Guidelines

Follow Conventional Commits (`feat:`, `fix:`, `chore:`) as seen in the existing git history. Write focused commits that leave the tree buildable; Husky + lint-staged will auto-format staged changes. Pull requests should summarize scope, list impacted packages, reference Jira/GitHub issues, and include screenshots or GIFs for visible UI updates. Note any required environment variables or migrations so reviewers can reproduce the change, and update `docs/development-plan.md` if the delivery timeline or scope shifts.

## Software Engineering Best Practices

- **Configuration first**: add new runtime settings through typed validation (`backend/src/config/env.validation.ts`) and surface them via `.env.example` so environments stay reproducible.
- **Service boundaries**: expose back-end capabilities with dedicated modules + controllers (`knowledge`/`chat`) and keep cross-cutting concerns globalized (`AppConfigModule`, `AiModule`).
- **Streaming by default**: use SSE for long-running AI workflows (`/api/v1/chat`) and structure front-end handlers around incremental updates instead of post-processing.
- **Source of truth scripts**: automation lives under `scripts/`; ingestion tools (e.g. `scripts/knowledge/ingest-yuque.ts`) should use Playwright to scrape public knowledge, emit Markdown into `tmp/`, and let callers decide if/when to push into APIs. Canvas-only widgets fallback to screenshots (`tmp/knowledge/images/*`) with optional Tesseract OCR (control via `YUQUE_OCR` / `YUQUE_OCR_LANG`).
- **React hygiene**: derive render data within the component body, rely on events for mutations, and keep effects solely for DOM or network sync—see `ChatRoute` history derivation.
- **Schema everywhere**: validate payloads with zod on the server (`ingestDocumentSchema`) to guard internal services and return structured responses `{ data: ... }`.
- **Developer feedback**: log meaningful messages (success/failure with IDs) in scripts and controllers; prefer `Logger` in Nest services to centralize telemetry.
- **AI integration**: use the Vercel AI SDK (`ai`, `@ai-sdk/openai`) for all LLM calls so streaming, retries, and provider swaps stay consistent across modules.

## 调试bug

- 调试bug过程中，如果有启动什么会占用端口的脚本，记得检查完就cancel 掉。
