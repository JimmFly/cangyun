# Cangyun Monorepo

This is a front-end/back-end separated monorepo managed with pnpm workspaces.

- apps/: Frontend applications (e.g., Next.js, Vite, etc.)
- backend/: NestJS backend
- packages/: Shared libraries (utils, UI, types)

## Quick start

1. Install pnpm if you don't have it:
   npm i -g pnpm

2. Install dependencies (from repository root):
   pnpm install

3. Run backend in dev mode:
   pnpm dev

## Git setup

Initialize Git in the repository ROOT only (here). Do not run `git init` inside subfolders like `backend`.

