# Cangyun Monorepo

Unified frontend + backend workspace managed with pnpm. The repository mirrors the architecture described in `docs/rfc-003-frontend-architecture.md`.

## 📚 Documentation

- **[Quick Start Guide](./docs/quick-start.md)** - Get up and running in minutes
- **[Developer Experience Setup](./docs/developer-experience-setup.md)** - Detailed configuration reference
- [RFC-003: Frontend Architecture](./docs/rfc-003-frontend-architecture.md)

## Workspace layout

- `apps/web` – Vite/React application (React 19)
- `apps/common/*` – Shared packages published internally as `@cangyun-ai/*`
  - analytics · config · graphql · hooks · i18n · router · types · ui · utils
- `backend` – NestJS service powering the APIs consumed by the web app

## Prerequisites

- Node.js 18+ (use `corepack enable` to ensure pnpm version parity)
- pnpm (workspace is pinned via the `packageManager` field)

## Quick start

```bash
# Install dependencies and build the shared packages once
pnpm run setup

# Launch web + backend together (shared logs prefixed by pnpm)
pnpm run dev

# Or run individual stacks
pnpm run dev:web
pnpm run dev:backend
```

## Checks & builds

```bash
# Type-only compilation for every package (common libs, web, backend)
pnpm run typecheck

# Code quality checks
pnpm run lint            # Check format + lint
pnpm run lint:fix        # Auto-fix issues

# Tests
pnpm run test

# Run all checks (lint + typecheck + test)
pnpm run check

# Production builds (shared packages → web → backend)
pnpm run build
```

## Developer Experience

This project uses **Husky + lint-staged** for automatic code quality checks on commit:

- 🎨 Prettier automatically formats your code
- 🔍 ESLint catches issues before they reach CI
- ⚡ Only staged files are checked (fast!)

The shared packages live under `apps/common/*` and use TypeScript project references. They expose the `@cangyun-ai/*` aliases configured in `tsconfig.base.json`, so application code can import them without relative paths.

## Git tips

- Git hooks are automatically configured on `pnpm install`
- Commit staged files: `git commit` will auto-format and lint
- Pre-commit checks can be skipped with `git commit --no-verify` (not recommended)
- When adding new packages, update `pnpm-workspace.yaml` and the root path mappings to keep tooling consistent.
