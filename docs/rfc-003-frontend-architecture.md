# RFC-003: Frontend Architecture Blueprint

- **Status:** Draft
- **Date:** 2025-10-07
- **Authors:** Frontend Guild
- **Reviewers:** Platform Engineering, Product Design, QA
- **Stakeholders:** Product, Backend, AI/ML, Customer Success

## 1. Background

`apps/web` is evolving from a simple Vite starter into the primary user interface for Cangyun. Recent initiatives (AI chatbot, dashboards, knowledge base) increase complexity across data flows, routing, styling, and deployment. To keep development efficient and predictable, we need a documented frontend architecture that scales with cross-functional teams, enforces standards, and remains adaptable to future product directions.

This RFC consolidates prior decisions (React 19,## 19. Open Questions

- Should we publish `@cangyun-ai/*` packages to a private npm registry for versioning clarity?
- Do we introduce Storybook immediately or defer until shared UI set matures?
- Should we enforce strict package ownership via GitHub code owners?
- How do we handle breaking changes in common packages (semantic versioning? changelog?)?
- Are there regulatory requirements (e.g., data residency) that influence client-side logging/storage?

## 20. ESLint Rules for Package Boundaries

To enforce architectural boundaries:

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          // Common packages cannot depend on specific apps
          {
            target: './apps/common/**',
            from: './apps/web/**',
            message: 'Common packages cannot depend on specific applications',
          },
          {
            target: './apps/common/**',
            from: './apps/admin/**',
            message: 'Common packages cannot depend on specific applications',
          },
          // Foundation layer cannot depend on higher layers
          {
            target: './apps/common/types/**',
            from: './apps/common/!(types)/**',
            message:
              'types package must have no dependencies on other common packages',
          },
          {
            target: './apps/common/utils/**',
            from: './apps/common/!(types|utils)/**',
            message: 'utils can only depend on types',
          },
          // Prevent feature-to-feature imports in web app
          {
            target: './apps/web/src/features/*',
            from: './apps/web/src/features/*',
            except: ['./apps/web/src/features/index.ts'],
            message: 'Features should not import from each other directly',
          },
        ],
      },
    ],
    'import/no-cycle': ['error', { maxDepth: 10 }],
  },
};
```

---

**Next Steps:**

1. Review and approve package-based architecture approach
2. Create detailed implementation tickets for Phase 0-1
3. Set up `apps/common/` directory structure and initial packages
4. Configure TypeScript project references and path mappings
5. Update `pnpm-workspace.yaml` and root `package.json`
6. Begin migration starting with `@cangyun-ai/types` and `@cangyun-ai/utils`
7. Schedule knowledge-sharing sessions to onboard teams to the new conventions
8. Document each package's API and usage patterns

**Success Criteria:**

- All common packages have clear README documentation
- Import paths use `@cangyun-ai/*` prefix consistently
- No circular dependencies detected by ESLint
- TypeScript compilation succeeds for all packages
- All tests pass after migration
- Build time improves or remains stable
- Developer feedback is positive regarding ergonomics v7, Apollo GraphQL, Tailwind CSS + shadcn-ui, `@graphql-codegen` + `graphql` as the schema bridge) and adds guidance on structure, state management, testing, and operational workflows.

## 2. Goals & Non-Goals

### 2.1 Goals

- Define a layered architecture that keeps domain logic, UI, and infrastructure concerns separated.
- Standardise project structure, naming, and coding conventions to streamline onboarding and code review.
- Ensure the stack supports real-time GraphQL interactions, rich interactions, and progressive enhancement.
- Provide guidance for performance, accessibility, localisation, and analytics instrumentation.
- Outline a roadmap for incremental adoption so teams can migrate without blocking feature delivery.

### 2.2 Non-Goals

- Mandating server-side rendering or microfrontend adoption (future evaluations may revisit).
- Replacing existing backend or deployment tooling; focus is the web client.
- Exhaustive design system specification (handled by design tokens initiative).

## 3. Architectural Principles

1. **Feature-first modularity:** Group code by domain feature (chat, dashboard, settings) with clear boundaries.
2. **Declarative data flow:** Centralise remote data access via GraphQL and co-locate queries with route modules to leverage React Router data APIs.
3. **Progressive enhancement:** Core experiences should degrade gracefully when JavaScript features or network conditions are limited.
4. **Accessibility & localisation:** Accessibility (a11y) and internationalisation (i18n) are first-class; components ship with semantic markup and translation hooks by default.
5. **Observability:** Instrument usage, performance, and errors to support operational excellence.
6. **Automation-friendly:** Embrace code generation (GraphQL, routes, i18n) and static analysis to reduce human error.

## 4. High-Level Architecture

### 4.1 Monorepo Structure

To support multiple frontend applications (web, admin dashboard, mobile web) with shared infrastructure, we adopt a **package-based architecture** under `apps/common/`. This approach provides:

- **Clear module boundaries** with explicit dependencies
- **Independent versioning** and testing for each package
- **Consistent dependency management** via single `pnpm-lock.yaml` at root
- **Reusability** across present and future applications

```
apps/
  ├── web/                          # Main web application
  │   ├── src/
  │   │   ├── app/                  # Application entry point
  │   │   ├── features/             # Business feature modules (chat, dashboard, settings)
  │   │   │    └── <feature>/
  │   │   │         ├── routes/            # React Router v7 route modules
  │   │   │         ├── components/        # Feature-specific components
  │   │   │         ├── hooks/             # Feature-specific hooks
  │   │   │         ├── services/          # Thin facades over @cangyun-ai/* packages
  │   │   │         └── tests/
  │   │   └── styles/               # Application-level styles
  │   └── package.json
  │
  ├── admin/                        # Admin dashboard (future)
  │   └── ...
  │
  └── common/                       # Shared application infrastructure
      │
      ├── graphql/                  # @cangyun-ai/graphql
      │   ├── src/
      │   │   ├── client/           # Apollo Client setup, links, cache config
      │   │   ├── operations/       # .graphql files organized by domain
      │   │   │   └── generated/    # Codegen output (types + hooks)
      │   │   ├── hooks/            # Custom GraphQL hooks
      │   │   ├── schema/           # schema.graphql (pulled from backend)
      │   │   └── index.ts
      │   ├── codegen.yml
      │   └── package.json
      │
      ├── i18n/                     # @cangyun-ai/i18n
      │   ├── src/
      │   │   ├── config/           # i18next configuration
      │   │   ├── hooks/            # useTranslation, useLocale, useFormatters
      │   │   ├── utils/            # Date/number/currency formatters
      │   │   └── types/            # Generated translation types
      │   ├── locales/              # Translation files (zh-CN, zh-TW, en-US)
      │   └── package.json
      │
      ├── ui/                       # @cangyun-ai/ui
      │   ├── src/
      │   │   ├── components/       # shadcn-ui based components
      │   │   ├── hooks/            # useTheme, useMediaQuery, useToast
      │   │   └── theme/            # Design tokens, Tailwind preset
      │   └── package.json
      │
      ├── utils/                    # @cangyun-ai/utils
      │   ├── src/
      │   │   ├── array/            # Array utilities (groupBy, chunk, unique)
      │   │   ├── string/           # String utilities (truncate, slugify, sanitize)
      │   │   ├── date/             # Date utilities
      │   │   ├── async/            # debounce, throttle, retry
      │   │   └── validation/       # email, url, phone validators
      │   └── package.json
      │
      ├── hooks/                    # @cangyun-ai/hooks
      │   ├── src/                  # Common React hooks (useDebounce, useLocalStorage, etc.)
      │   └── package.json
      │
      ├── analytics/                # @cangyun-ai/analytics
      │   ├── src/
      │   │   ├── providers/        # AnalyticsProvider, PerformanceProvider
      │   │   ├── hooks/            # useAnalytics, usePageView, usePerformance
      │   │   ├── trackers/         # Google Analytics, Mixpanel, Sentry integrations
      │   │   └── schema/           # Type-safe event definitions
      │   └── package.json
      │
      ├── config/                   # @cangyun-ai/config
      │   ├── src/
      │   │   ├── env.ts            # Environment variable management
      │   │   ├── featureFlags.ts   # Feature flag utilities
      │   │   └── constants.ts      # Global constants
      │   └── package.json
      │
      ├── router/                   # @cangyun-ai/router
      │   ├── src/
      │   │   ├── guards/           # AuthGuard, RoleGuard, FeatureFlagGuard
      │   │   ├── layouts/          # AuthenticatedLayout, PublicLayout, AdminLayout
      │   │   └── hooks/            # useRouteMeta, useRouteAnalytics, useBreadcrumbs
      │   └── package.json
      │
      └── types/                    # @cangyun-ai/types
          ├── src/
          │   ├── api/              # API-related types
          │   ├── models/           # Data models
          │   └── ui/               # UI-related types
          └── package.json

packages/
  └── (Reserved for true standalone npm packages: CLI tools, SDKs, etc.)

backend/
  └── ...
```

### 4.2 Package Naming Convention

All packages under `apps/common/` use the `@cangyun-ai/` prefix to distinguish them from true standalone packages (`@cangyun/`) that could be published to npm. This maintains clarity about internal dependencies.

### 4.3 Package Dependency Hierarchy

Packages are organized in layers to prevent circular dependencies:

```
Layer 1 (Foundation):
  - @cangyun-ai/types          # No dependencies

Layer 2 (Core Utilities):
  - @cangyun-ai/utils          # Depends on: types
  - @cangyun-ai/config         # Depends on: types

Layer 3 (React Primitives):
  - @cangyun-ai/hooks          # Depends on: types, utils

Layer 4 (Domain Infrastructure):
  - @cangyun-ai/i18n           # Depends on: types, utils, hooks
  - @cangyun-ai/graphql        # Depends on: types, config

Layer 5 (UI & Features):
  - @cangyun-ai/ui             # Depends on: types, hooks, i18n
  - @cangyun-ai/analytics      # Depends on: types, config

Layer 6 (Application):
  - @cangyun-ai/router         # Depends on: types, hooks, analytics
  - apps/web                    # Depends on: all common packages
```

### 4.4 Layer Responsibilities

- **Types Layer:** Shared TypeScript definitions with zero runtime dependencies
- **Utils Layer:** Pure functions (no React, no side effects)
- **Hooks Layer:** Reusable React hooks built on utils
- **Infrastructure Layer:** GraphQL client, i18n system, configuration management
- **UI Layer:** Design system components, theming, analytics
- **Application Layer:** Route guards, layouts, application-specific orchestration
- **App Layer (web):** Feature modules consuming common packages, application entry point

## 5. Data & State Management

### 5.1 GraphQL Package (`@cangyun-ai/graphql`)

Centralizes all GraphQL infrastructure in a dedicated package that can be shared across multiple frontend applications.

**Responsibilities:**

- Apollo Client configuration (HTTP + WebSocket links)
- GraphQL operation definitions (`.graphql` files)
- Code generation (types + hooks via `@graphql-codegen`)
- Cache policies and normalization
- Global error handling and retry logic
- Custom hooks for common patterns (optimistic updates, subscriptions)

**Key Features:**

- **Apollo Client 3** with split links:
  - HTTP link for queries and mutations
  - WebSocket link (`graphql-ws`) for subscriptions
- **Schema-first approach:** Backend `schema.graphql` is source of truth
- **Type safety:** Full TypeScript types generated from operations
- **Normalized cache:** Configured type policies for entities (`ChatMessage`, `ChatSession`, etc.)
- **Error handling:** Centralized error link for auth (401), retries, and logging

**Package Structure:**

```typescript
// apps/common/graphql/src/client/apollo.ts
import { ApolloClient, InMemoryCache, split, HttpLink } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_GRAPHQL_ENDPOINT,
});

const wsLink = new GraphQLWsLink(
  createClient({
    url: import.meta.env.VITE_GRAPHQL_WS_ENDPOINT,
  })
);

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink
);

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache({
    typePolicies: {
      ChatMessage: { keyFields: ['id'] },
      ChatSession: { keyFields: ['id'] },
    },
  }),
});
```

**Usage in Applications:**

```typescript
// apps/web/src/features/chat/routes/ChatRoute.tsx
import {
  useChatSessionQuery,
  useSendMessageMutation,
} from '@cangyun-ai/graphql';
import { defer } from 'react-router';

export function loader({ params }: { params: { sessionId: string } }) {
  return defer({
    session: apolloClient.query({
      query: chatSessionQuery,
      variables: { id: params.sessionId },
    }),
  });
}

function ChatComponent() {
  const { data, loading } = useChatSessionQuery({
    variables: { id: '123' },
  });

  const [sendMessage] = useSendMessageMutation({
    optimisticResponse: {
      sendMessage: {
        __typename: 'Message',
        id: tempId,
        content: input,
        status: 'sending',
      },
    },
  });

  // ...
}
```

**Schema Governance:**

1. Backend maintains `schema.graphql` as source of truth
2. Frontend pulls schema via `pnpm graphql:pull` → `apps/common/graphql/src/schema/`
3. Codegen watches schema and regenerates types automatically
4. Generated files committed to Git for CI type-checking
5. Breaking changes detected via `graphql-inspector diff --fail-on-breaking`

**Dependencies:**

- Internal: `@cangyun-ai/types`, `@cangyun-ai/config`
- External: `@apollo/client`, `graphql-ws`, `@graphql-codegen/*`

### 5.2 Local/UI State

- Use React Context + `useReducer` for complex UI flows (chat streaming, composer state).
- Prefer component-local state (`useState`) for simple presentation logic.
- For cross-feature coordination (e.g., theme or auth), expose contexts from `app/providers`.

### 5.3 Forms & Mutations

- Use React Router actions (`useFetcher`) for imperative operations (rename, delete) while delegating to `@cangyun-ai/graphql` mutations.
- For optimistic UI, update Apollo cache in action handlers and revert on error.
- Leverage `useOptimisticMutation` hook from `@cangyun-ai/graphql` for common patterns.

## 6. Routing Strategy

- Adopt React Router v7 `createBrowserRouter` with route manifest defined in `src/app/router.tsx`.
- Each feature's route module re-exports `handle` metadata (breadcrumbs, analytics, page title) consumed by hooks from `@cangyun-ai/router`.
- Route guards and layouts provided by `@cangyun-ai/router`:
  - `AuthGuard`: Validates authentication
  - `RoleGuard`: Checks user permissions
  - `FeatureFlagGuard`: Controls access based on feature flags
  - `AuthenticatedLayout`, `PublicLayout`, `AdminLayout`: Standard layout compositions
- Implement scroll restoration via React Router `useScrollRestoration`; allow features to opt into custom logic (e.g., chat keeps scroll pinned to bottom).

**Example:**

```typescript
// apps/web/src/app/router.tsx
import { createBrowserRouter } from 'react-router'
import { AuthGuard, AuthenticatedLayout } from '@cangyun-ai/router'

export const router = createBrowserRouter([
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AuthenticatedLayout />,
        children: [
          {
            path: '/chat',
            lazy: () => import('../features/chat/routes'),
          },
          {
            path: '/dashboard',
            lazy: () => import('../features/dashboard/routes'),
          },
        ],
      },
    ],
  },
])
```

## 7. UI Layer & Design System

- Tailwind CSS + shadcn-ui provide the primary styling and component baseline via `@cangyun-ai/ui`.
- Bootstrap shadcn-ui generators to scaffold components into `@cangyun-ai/ui`, keeping tokens centralized in the package's `tailwind.config.ts`.
- Adopt shadcn-ui's Radix-powered primitives (Button, Dialog, Dropdown, NavigationMenu, etc.) and wrap them with project-specific defaults (branding, analytics hooks). Custom variants use `class-variance-authority` per shadcn-ui conventions.
- Theme management handled by `@cangyun-ai/ui`:
  - Design tokens defined in `theme/tokens.ts`
  - Tailwind preset in `theme/tailwind.preset.ts` for consistent configuration
  - Dark mode via `.dark` class on `<html>`; `useTheme()` hook for features
- Extend shadcn-ui components with accessibility patterns (ARIA attributes, focus management) baked in, reducing per-feature burden while satisfying WCAG AA guidelines.

**Usage:**

```typescript
// apps/web/src/features/chat/components/ChatHeader.tsx
import { Button, Dialog } from '@cangyun-ai/ui'
import { useTheme } from '@cangyun-ai/ui'

function ChatHeader() {
  const { theme, setTheme } = useTheme()

  return (
    <header>
      <Button variant="outline" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        Toggle Theme
      </Button>
    </header>
  )
}
```

## 8. Cross-Cutting Concerns

### 8.1 Internationalization (`@cangyun-ai/i18n`)

Comprehensive i18n infrastructure supporting multiple locales with type safety.

**Supported Locales:**

- `zh-CN` (Simplified Chinese, default)
- `zh-TW` (Traditional Chinese)
- `en-US` (English)
- `ja-JP` (Japanese, future)

**Key Features:**

- **i18next + react-i18next** for React integration
- **Type-safe translations:** Generated types ensure no missing keys
- **Namespace isolation:** Each feature has its own namespace (`common`, `chat`, `dashboard`, `settings`)
- **Lazy loading:** Translations loaded on-demand per namespace
- **Pluralization & interpolation:** Full i18next feature support
- **Format utilities:** Locale-aware date/number/currency formatting via `useFormatters`
- **Translation extraction:** CLI tools (`pnpm i18n:extract`) to find untranslated keys
- **Platform integration:** Sync with Lokalise/Crowdin for professional translation workflow

**Configuration:**

```typescript
// apps/common/i18n/src/config/i18next.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'zh-TW', 'en-US'],
    ns: ['common', 'chat', 'dashboard', 'settings'],
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React auto-escapes
    backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' },
    detection: {
      order: ['querystring', 'cookie', 'localStorage', 'navigator'],
      caches: ['localStorage', 'cookie'],
    },
  });
```

**Usage:**

```typescript
// apps/web/src/features/chat/components/ChatHeader.tsx
import { useTranslation, useFormatDate } from '@cangyun-ai/i18n'

function ChatHeader({ session }: { session: ChatSession }) {
  const { t } = useTranslation('chat')
  const formatDate = useFormatDate()

  return (
    <header>
      <h1>{t('session_title', { title: session.title })}</h1>
      <time>{formatDate(session.createdAt, 'PPP')}</time>
      <p>{t('message_count', { count: session.messageCount })}</p>
    </header>
  )
}
```

**Translation Workflow:**

1. Developers add translation keys: `t('new_feature.action')`
2. CI runs `pnpm i18n:extract` to detect missing keys
3. Export to translation platform (Lokalise/Crowdin)
4. Translators complete translations
5. Auto-PR back to repository with updated JSON files
6. Type generation ensures compile-time safety

**Dependencies:**

- Internal: `@cangyun-ai/types`, `@cangyun-ai/utils`, `@cangyun-ai/hooks`
- External: `i18next`, `react-i18next`, `date-fns`

### 8.2 Accessibility

- Enforce accessible defaults (semantic HTML, `aria-live` for streaming updates, keyboard navigation across modals/menus).
- Add lint rules (`eslint-plugin-jsx-a11y`) and storybook accessibility checks (future addition).
- All user-facing text must use `@cangyun-ai/i18n` translations—no hardcoded strings.

## 6. Routing Strategy

- Adopt React Router v7 `createBrowserRouter` with route manifest defined in `src/app/router.tsx`.
- Each feature’s route module re-exports `handle` metadata (breadcrumbs, analytics, page title) consumed by shared hooks (`useRouteMeta`, `useRouteAnalytics`).
- Provide guard layouts (`AuthenticatedLayout`, `AdminLayout`) with loaders validating permissions.
- Implement scroll restoration via React Router `useScrollRestoration`; allow features to opt into custom logic (e.g., chat keeps scroll pinned to bottom).

## 7. UI Layer & Design System

- Tailwind CSS + shadcn-ui provide the primary styling and component baseline. We will bootstrap shadcn-ui generators to scaffold components into `shared/ui`, keeping tokens centralised in `tailwind.config.ts` (spacing, typography, color aliases).
- Adopt shadcn-ui's Radix-powered primitives (Button, Dialog, Dropdown, NavigationMenu, etc.) and wrap them with project-specific defaults (branding, analytics hooks). Custom variants use `class-variance-authority` per shadcn-ui conventions.
- Maintain a `shared/ui/theme.ts` that maps design tokens to shadcn-ui config (e.g., color palettes, radii). Dark mode handled by toggling `.dark` class on `<html>`; expose `useTheme()` hook for features.
- Extend shadcn-ui components with accessibility patterns (ARIA attributes, focus management) baked in, reducing per-feature burden while satisfying WCAG AA guidelines.

## 8. Cross-Cutting Concerns

### 8.1 Accessibility & Localisation

- Use `react-i18next` for translations; maintain namespaces per feature.
- Enforce accessible defaults (semantic HTML, `aria-live` for streaming updates, keyboard navigation across modals/menus).
- Add lint rules (`eslint-plugin-jsx-a11y`) and storybook accessibility checks (future addition).

### 8.2 Accessibility

- Enforce accessible defaults (semantic HTML, `aria-live` for streaming updates, keyboard navigation across modals/menus).
- Add lint rules (`eslint-plugin-jsx-a11y`) and storybook accessibility checks (future addition).
- All user-facing text must use `@cangyun-ai/i18n` translations—no hardcoded strings.

### 8.3 Analytics & Telemetry (`@cangyun-ai/analytics`)

- Expose `useAnalytics()` hook to log events; automatically include route metadata (screen name, session id).
- Collect performance metrics via `web-vitals` and send with analytics events.
- Integrate error monitoring (Sentry or similar) with React error boundaries.
- Type-safe event schema defined in `@cangyun-ai/analytics/schema`.

### 8.4 Feature Flags (`@cangyun-ai/config`)

- Provide flag utilities via `@cangyun-ai/config`; allow remote config via GraphQL or LaunchDarkly.
- Features read flags through hooks; fallback to sensible defaults for offline scenarios.

### 8.5 Security

- Sanitize user-generated content (markdown rendering) using reliable libraries (e.g., `@uiw/react-md-editor` + DOMPurify).
- All network requests include auth headers; ensure tokens stored securely (httpOnly cookies preferred).
- Guard against XSS by forbidding `dangerouslySetInnerHTML` outside audited wrappers.

## 9. Testing & Quality

### 9.1 Testing Pyramid

- **Unit (Vitest):** utilities, hooks, reducers.
- **Component (React Testing Library):** feature components with mocked router + Apollo clients.
- **Integration:** route modules using `createMemoryRouter`; test loaders/actions with MSW GraphQL mocks.
- **E2E (Playwright):** user journeys (chat conversation, dashboard filters, settings save).

### 9.2 Tooling

- ESLint (flat config) with TypeScript, React, a11y, unused imports removal.
- Prettier for formatting; Husky + lint-staged optional (evaluate once team size grows).
- Storybook (future) for UI primitives; leverage Chromatic for visual diffs.

## 10. Build & Deployment Pipeline

### 10.1 Workspace Configuration

**pnpm-workspace.yaml:**

```yaml
packages:
  - 'apps/*'
  - 'apps/common/*'
  - 'packages/*'
  - 'backend'
```

**Root package.json Scripts:**

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter \"./apps/**\" dev",
    "dev:web": "pnpm --filter web dev",
    "build": "pnpm --recursive --filter \"./apps/common/**\" build && pnpm --filter web build",
    "build:common": "pnpm --recursive --filter \"./apps/common/**\" build",
    "typecheck": "pnpm --recursive typecheck",
    "lint": "pnpm --recursive lint",
    "test": "pnpm --recursive test",
    "graphql:pull": "pnpm --filter @cangyun-ai/graphql graphql:pull",
    "graphql:codegen": "pnpm --filter @cangyun-ai/graphql codegen",
    "i18n:extract": "pnpm --filter @cangyun-ai/i18n extract-keys"
  }
}
```

### 10.2 TypeScript Configuration

**Root tsconfig.base.json:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@cangyun-ai/graphql": ["./apps/common/graphql/src"],
      "@cangyun-ai/i18n": ["./apps/common/i18n/src"],
      "@cangyun-ai/ui": ["./apps/common/ui/src"],
      "@cangyun-ai/utils": ["./apps/common/utils/src"],
      "@cangyun-ai/hooks": ["./apps/common/hooks/src"],
      "@cangyun-ai/analytics": ["./apps/common/analytics/src"],
      "@cangyun-ai/config": ["./apps/common/config/src"],
      "@cangyun-ai/router": ["./apps/common/router/src"],
      "@cangyun-ai/types": ["./apps/common/types/src"]
    }
  }
}
```

**Per-package tsconfig.json:**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
}
```

### 10.3 Build Process

- Use pnpm workspaces; `pnpm build` runs Vite build with Tailwind + GraphQL codegen pre-step.
- Build common packages first, then applications.
- Produce code-split bundles: main app and vendor chunk; leverage React Router lazy routes.
- Static assets served from CDN; ensure cache busting via hashed filenames.
- Maintain environment separation via `.env.development`, `.env.preview`, `.env.production` with runtime config injection.

## 11. Performance Guidelines

- Lazy-load heavy feature modules (chat, analytics dashboards) via React Router `lazy()`.
- Use Suspense + skeletons for perceived performance.
- Memoize expensive components with `React.memo`; use `useCallback` for stable handlers when necessary.
- Monitor bundle size with `pnpm analyze` (custom Vite plugin) and set CI budget thresholds.
- Implement request batching and caching at GraphQL layer to minimise network chatter.

## 12. Accessibility Checklist

- Provide skip links (`Skip to content`).
- Ensure color contrast meets WCAG AA (Tailwind theme to enforce).
- Implement focus trapping in dialogs; return focus on close.
- Announce background operations (loading states) with `aria-live` region.

## 13. Internationalisation

Handled by `@cangyun-ai/i18n` package (see section 8.1 for details).

- Default locale: `zh-CN`, support `en-US`, `zh-TW` as secondary.
- Resource files stored in `apps/common/i18n/locales/<lang>/<namespace>.json`.
- Translation extraction via `pnpm i18n:extract` to identify missing keys.
- Numeric/date formatting handled via `useFormatters` hook from `@cangyun-ai/i18n`.

## 14. Analytics & Observability

Handled by `@cangyun-ai/analytics` package.

- Define standard analytics schema (event name, required props) in `@cangyun-ai/analytics/schema`.
- Log page views on route change via `useRouteAnalytics` from `@cangyun-ai/router`.
- Capture user feedback within chat via instrumentation (message rating, copy events).
- Tie front-end logs to backend trace IDs when available.

## 15. Dev Experience & Tooling

### 15.1 Onboarding & Environment

- Provide a single `pnpm setup` script that runs `pnpm install`, pulls the latest GraphQL schema (`pnpm graphql:schema`), executes initial codegen, and copies `.env.example` → `.env.local`.
- Document workspace prerequisites in `docs/development.md` (Node version via fnm, pnpm usage, required CLI tools such as shadcn-ui generator, Docker for backend services).
- Supply a `.devcontainer` (or `scripts/setup-local.sh`) for one-command environment bootstrapping on new machines.
- Maintain VS Code recommendations (`.vscode/extensions.json`) covering Tailwind, GraphQL, ESLint, and shadcn-ui snippets; configure `.vscode/settings.json` for format-on-save, Tailwind class sorting, and GraphQL IntelliSense.

### 15.2 Automation & Guardrails

- Enforce module boundaries via ESLint `import/no-restricted-paths` (prevent feature ↔ feature coupling without explicit contracts).
- Add type-check (`pnpm typecheck`), lint (`pnpm lint`), and test (`pnpm test`) tasks to CI; wire optional pre-commit hooks using `lefthook`/`husky` + `lint-staged` for staged file checks.
- Run GraphQL codegen in watch mode (`pnpm codegen:watch`) during local development so generated hooks stay in sync; fail CI if `git status` is dirty post-codegen.
- Provide hot-reload friendly scripts: `pnpm dev:web` (Vite + Tailwind), `pnpm dev:backend`, and `pnpm dev` (concurrently via the interactive launcher) with consistent logging prefixes.
- Offer `pnpm analyze` (bundle stats), `pnpm format` (Prettier), and `pnpm check` (composite command running lint + typecheck + tests) for quick feedback before PRs.

### 15.3 Developer Utilities

- Prefer absolute imports using TypeScript path mapping (configured in `tsconfig.base.json`).
- Import from common packages: `import { Button } from '@cangyun-ai/ui'`
- Provide CLI scaffolds:
  - `pnpm generate feature <name>` scaffolds feature directories (routes, provider, tests).
  - `pnpm dlx shadcn-ui@latest add <component>` imports shadcn-ui primitives into `@cangyun-ai/ui`.
  - `pnpm generate hook <name>` to spin up boilerplate with consistent conventions.
  - `pnpm test:watch --filter apps/web` for focused Vitest runs.
  - `pnpm storybook` (future) for interactive docs once shared UI stabilizes.
- Integrate GraphQL playground tooling (GraphiQL via backend or `pnpm graphql:studio`) for schema exploration.
- Encourage use of React DevTools, Apollo DevTools, and Redux/Network inspectors via documentation.

## 16. Incremental Adoption Plan

1. **Phase 0 (Weeks 1-2): Foundation Setup**
   - Create `apps/common/` directory structure
   - Set up `@cangyun-ai/types` package (no dependencies)
   - Set up `@cangyun-ai/utils` package
   - Configure root `tsconfig.base.json` with path mappings
   - Update `pnpm-workspace.yaml`

2. **Phase 1 (Weeks 3-4): Core Infrastructure**
   - Migrate to `@cangyun-ai/config` (env, feature flags)
   - Migrate to `@cangyun-ai/hooks`
   - Set up React Router v7 with `@cangyun-ai/router` package
   - Update all import paths in `apps/web`

3. **Phase 2 (Weeks 5-6): GraphQL & i18n**
   - Migrate GraphQL setup to `@cangyun-ai/graphql`
   - Configure Apollo Client, codegen, schema pulling
   - Migrate i18n to `@cangyun-ai/i18n`
   - Move all translation files
   - Test all GraphQL operations and translations

4. **Phase 3 (Weeks 7-8): UI & Analytics**
   - Set up `@cangyun-ai/ui` with shadcn-ui components
   - Migrate Tailwind config and design tokens
   - Set up `@cangyun-ai/analytics` with Sentry, web-vitals
   - Restructure `apps/web/src` to feature-based layout
   - Migrate chat feature to `features/chat`

5. **Phase 4 (Weeks 9-10): Polish & Documentation**
   - Add automated bundle analysis
   - Introduce Storybook (optional)
   - Write migration guides and package documentation
   - Performance testing and optimization
   - Team training sessions

## 17. Risks & Mitigations

| Risk                                               | Impact | Mitigation                                                         |
| -------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| Package interdependency complexity                 | Medium | Strict layered architecture; ESLint rules to prevent circular deps |
| Migration disruption during active development     | High   | Phased rollout; feature freeze during critical phases              |
| Learning curve for new developers                  | Medium | Comprehensive documentation; package READMEs; onboarding sessions  |
| Performance regressions from GraphQL over-fetching | High   | Use `defer`, Apollo cache tuning, request logging                  |
| Tooling setup complexity (codegen, i18n, etc.)     | Medium | `pnpm setup` script automates all initialization                   |
| Version drift across common packages               | Low    | Use `workspace:*` protocol; unified versioning strategy            |

## 18. Benefits of Package-Based Architecture

### 18.1 Code Reusability

- Future applications (`apps/admin`, `apps/mobile-web`) can reuse all common packages
- No code duplication; bug fixes propagate to all consumers
- Shared infrastructure reduces development time for new apps

### 18.2 Clear Boundaries

- Each package has a single responsibility
- Explicit dependencies prevent spaghetti code
- Team ownership: different teams can own different packages

### 18.3 Independent Development

- Packages can be developed, tested, and versioned independently
- Use `pnpm --filter` to work on specific packages
- Faster test suites (test only what changed)

### 18.4 Type Safety

- TypeScript project references provide excellent type checking
- Changes to types propagate across all dependents
- Better IDE intellisense and autocomplete

### 18.5 Performance

- Vite caches unchangedpackages effectively
- Incremental builds are faster
- Better tree-shaking with explicit exports

## 19. Open Questions

- Do we introduce Storybook immediately or defer until shared UI set matures?
- Should we enforce strict feature boundaries via code owners?
- How do we integrate with potential mobile/web hybrid components in the future?
- Are there regulatory requirements (e.g., data residency) that influence client-side logging/storage?

---

**Next Steps:**

1. Review and sign off on architecture principles.
2. Create migration tickets for Phase 1 tasks (directory restructuring, chat feature migration).
3. Schedule knowledge-sharing sessions to onboard teams to the new conventions.
