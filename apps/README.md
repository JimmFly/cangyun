# Apps Workspace

This directory hosts end-user applications that ship with the Cangyun monorepo.

- `apps/web` – React-based console and chat client (see `apps/web/README.md`).
- Additional surfaces (e.g., admin dashboards, mobile shells) should live under this folder following the same naming convention.

## Guidelines

- Prefer colocated feature folders (`src/features/<feature>`) with routing defined in `src/app/router.tsx`.
- Shared functionality belongs in `apps/common/*`; keep each app focused on UI and orchestration.
- Update this index whenever a new app is added so the team can discover entry points quickly.
