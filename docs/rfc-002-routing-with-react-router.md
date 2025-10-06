# RFC-002: Frontend Routing Management with React Router v7

- **Status:** Draft
- **Date:** 2025-10-07
- **Authors:** Frontend Guild
- **Reviewers:** Web Platform, Product Design, Architecture Team
- **Stakeholders:** Product, Backend, QA
- **Related RFCs:** RFC-003 (Frontend Architecture Blueprint)

## 1. Background

The `apps/web` frontend currently has only a minimal routing setup. As we expand with the AI chatbot and future modules (dashboard, knowledge base, settings), we need a scalable routing strategy. React Router v7 (the latest major release) introduces improved data APIs, SSR alignment, and bundle-splitting ergonomics.

This RFC proposes an extensible routing architecture leveraging React Router v7's data routers, integrated with our package-based architecture (`@cangyun-ai/*` packages as defined in RFC-003), to unify navigation, data loading, and error handling across the SPA.

## 2. Goals & Non-Goals

### 2.1 Goals

- Adopt React Router v7 `createBrowserRouter` / `RouterProvider` as the standard entry point.
- Define a central, type-safe route manifest that supports lazy loading, nested layouts, and code-splitting.
- Integrate loader/action APIs with `@cangyun-ai/graphql` for data fetching and mutations.
- Leverage routing utilities from `@cangyun-ai/router` package (guards, layouts, hooks).
- Enable streaming UI states (pending, optimistic updates) via `defer` and Suspense.
- Provide consistent error boundaries, 404/500 pages, and authentication guards.
- Support route-level analytics via `@cangyun-ai/analytics`, SEO metadata, and i18n hooks from `@cangyun-ai/i18n`.

### 2.2 Non-Goals

- Implement SSR/SSG (out of scope for this phase; maintain CSR but design for future SSR compatibility).
- File-based routing (maintain explicit route manifest for now).
- Micro-frontend integration (future consideration).

## 3. Proposed Architecture

### 3.1 Package Integration

This routing strategy integrates with the package-based architecture defined in RFC-003:

- **`@cangyun-ai/router`**: Provides reusable routing infrastructure
  - Route guards (`AuthGuard`, `RoleGuard`, `FeatureFlagGuard`)
  - Layout components (`AuthenticatedLayout`, `PublicLayout`, `AdminLayout`)
  - Routing hooks (`useRouteMeta`, `useRouteAnalytics`, `useBreadcrumbs`)
- **`@cangyun-ai/graphql`**: GraphQL client for data fetching in loaders
- **`@cangyun-ai/analytics`**: Analytics integration via route metadata

- **`@cangyun-ai/i18n`**: Localization for route titles and metadata

### 3.2 Routing Entry Point

**Location:** `apps/web/src/app/router.tsx`

Use React Router v7 `createBrowserRouter` with `RouterProvider` in `src/main.tsx`:

```tsx
// apps/web/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ApolloProvider } from '@apollo/client';
import { apolloClient } from '@cangyun-ai/graphql';
import { I18nProvider } from '@cangyun-ai/i18n';
import { AnalyticsProvider } from '@cangyun-ai/analytics';
import { router } from './app/router';
import { SplashScreen } from './app/components/SplashScreen';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApolloProvider client={apolloClient}>
      <I18nProvider>
        <AnalyticsProvider>
          <RouterProvider router={router} fallbackElement={<SplashScreen />} />
        </AnalyticsProvider>
      </I18nProvider>
    </ApolloProvider>
  </StrictMode>
);
```

### 3.3 Route Manifest

**Location:** `apps/web/src/app/router.tsx`

Central manifest using guards and layouts from `@cangyun-ai/router`:

```tsx
// apps/web/src/app/router.tsx
import { createBrowserRouter } from 'react-router';
import {
  AuthGuard,
  RoleGuard,
  FeatureFlagGuard,
  AuthenticatedLayout,
  PublicLayout,
} from '@cangyun-ai/router';
import { RootLayout } from './layouts/RootLayout';
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';
import { NotFoundPage } from './components/NotFoundPage';

export const router = createBrowserRouter([
  {
    id: 'root',
    path: '/',
    element: <RootLayout />,
    errorElement: <GlobalErrorBoundary />,
    children: [
      // Public routes
      {
        element: <PublicLayout />,
        children: [
          {
            path: 'login',
            lazy: () => import('../features/auth/routes/LoginRoute'),
          },
          {
            path: 'signup',
            lazy: () => import('../features/auth/routes/SignupRoute'),
          },
        ],
      },

      // Authenticated routes
      {
        element: <AuthGuard />,
        children: [
          {
            element: <AuthenticatedLayout />,
            children: [
              // Chat feature
              {
                path: 'chat',
                children: [
                  {
                    index: true,
                    lazy: () => import('../features/chat/routes/ChatListRoute'),
                  },
                  {
                    path: ':sessionId',
                    lazy: () =>
                      import('../features/chat/routes/ChatSessionRoute'),
                  },
                ],
              },

              // Dashboard feature
              {
                path: 'dashboard',
                lazy: () =>
                  import('../features/dashboard/routes/DashboardRoute'),
              },

              // Settings feature
              {
                path: 'settings',
                lazy: () => import('../features/settings/routes/SettingsRoute'),
              },

              // Admin section (role-based)
              {
                element: <RoleGuard requiredRole="admin" />,
                children: [
                  {
                    path: 'admin',
                    lazy: () => import('../features/admin/routes/AdminRoute'),
                  },
                ],
              },
            ],
          },
        ],
      },

      // 404 catch-all
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
```

### 3.4 Route Modules (Feature-based)

Each feature exports route modules following React Router v7 conventions:

**Structure:** `apps/web/src/features/<feature>/routes/<RouteName>.tsx`

**Route Module Components:**

- `Component` (default export): The route UI component
- `loader`: Async data fetching using `@cangyun-ai/graphql`
- `action`: Form submissions/mutations
- `ErrorBoundary`: Feature-specific error UI
- `handle`: Metadata for analytics, breadcrumbs, i18n

**Example:** `apps/web/src/features/chat/routes/ChatSessionRoute.tsx`

```tsx
import { defer, LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import {
  apolloClient,
  useChatSessionQuery,
  useSendMessageMutation,
} from '@cangyun-ai/graphql';
import { useTranslation } from '@cangyun-ai/i18n';
import { useRouteAnalytics } from '@cangyun-ai/router';
import { ChatSessionView } from '../components/ChatSessionView';

// Loader: Fetch initial data with GraphQL
export async function loader({ params }: LoaderFunctionArgs) {
  const { sessionId } = params;

  if (!sessionId) {
    throw new Response('Session ID required', { status: 400 });
  }

  // Use defer for streaming data
  return defer({
    session: apolloClient.query({
      query: ChatSessionDocument,
      variables: { id: sessionId },
    }),
  });
}

// Action: Handle mutations (send message, etc.)
export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const action = formData.get('_action');

  if (action === 'sendMessage') {
    const content = formData.get('content') as string;

    const result = await apolloClient.mutate({
      mutation: SendMessageDocument,
      variables: {
        sessionId: params.sessionId,
        content,
      },
      // Optimistic update
      optimisticResponse: {
        sendMessage: {
          __typename: 'Message',
          id: `temp-${Date.now()}`,
          content,
          role: 'user',
          createdAt: new Date().toISOString(),
        },
      },
    });

    return { success: true, message: result.data?.sendMessage };
  }

  throw new Response('Invalid action', { status: 400 });
}

// Component
export default function ChatSessionRoute() {
  const { t } = useTranslation('chat');

  // Analytics tracking
  useRouteAnalytics({
    screen: 'chat_session',
    properties: { feature: 'chat' },
  });

  return <ChatSessionView />;
}

// Error Boundary
export function ErrorBoundary() {
  const { t } = useTranslation('chat');
  const error = useRouteError();

  return (
    <div className="error-container">
      <h1>{t('errors.session_failed')}</h1>
      <p>{error?.message || t('errors.unknown')}</p>
      <Link to="/chat">{t('actions.back_to_chat')}</Link>
    </div>
  );
}

// Metadata for router hooks
export const handle = {
  breadcrumb: (data: any) => data?.session?.title || 'Chat',
  analytics: {
    screen: 'chat_session',
    category: 'chat',
  },
  i18n: {
    namespace: 'chat',
    title: 'chat:session_title',
  },
};
```

### 3.5 Layouts & Nested Routes

Layouts provided by `@cangyun-ai/router` package:

**1. RootLayout** (App-specific, not in common package)

```tsx
// apps/web/src/app/layouts/RootLayout.tsx
import { Outlet } from 'react-router';
import { Toaster } from '@cangyun-ai/ui';
import { ErrorBoundary } from './components/ErrorBoundary';

export function RootLayout() {
  return (
    <ErrorBoundary>
      <div className="app-root">
        <Outlet />
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}
```

**2. PublicLayout** (from `@cangyun-ai/router`)

- No authentication required
- Minimal chrome (logo, language switcher)
- Used for login, signup, public landing pages

**3. AuthenticatedLayout** (from `@cangyun-ai/router`)

- Verifies authentication in loader
- Redirects to `/login` if unauthenticated
- Full app shell: sidebar, header, notifications
- Nested `<Outlet />` for feature routes

**Example implementation in `@cangyun-ai/router`:**

```tsx
// apps/common/router/src/layouts/AuthenticatedLayout.tsx
import { Outlet, redirect, useLoaderData } from 'react-router';
import { apolloClient, CurrentUserDocument } from '@cangyun-ai/graphql';

export async function loader() {
  try {
    const { data } = await apolloClient.query({
      query: CurrentUserDocument,
      fetchPolicy: 'cache-first',
    });

    if (!data?.currentUser) {
      return redirect('/login');
    }

    return { user: data.currentUser };
  } catch (error) {
    return redirect('/login');
  }
}

export function AuthenticatedLayout() {
  const { user } = useLoaderData() as { user: User };

  return (
    <div className="authenticated-layout">
      <Sidebar user={user} />
      <main className="main-content">
        <Header user={user} />
        <Outlet />
      </main>
    </div>
  );
}
```

### 3.6 Route Guards

Route guards provided by `@cangyun-ai/router`:

**1. AuthGuard**

```tsx
// apps/common/router/src/guards/AuthGuard.tsx
import { Outlet, redirect } from 'react-router';
import { apolloClient, CurrentUserDocument } from '@cangyun-ai/graphql';

export async function loader() {
  const { data } = await apolloClient.query({
    query: CurrentUserDocument,
    fetchPolicy: 'cache-first',
  });

  if (!data?.currentUser) {
    throw redirect('/login');
  }

  return { user: data.currentUser };
}

export function AuthGuard() {
  return <Outlet />;
}
```

**2. RoleGuard**

```tsx
// apps/common/router/src/guards/RoleGuard.tsx
import { Outlet, redirect, useLoaderData } from 'react-router';

interface RoleGuardProps {
  requiredRole: string;
}

export function RoleGuard({ requiredRole }: RoleGuardProps) {
  return <Outlet />;
}

export async function loader({ context }: { context: { user: User } }) {
  if (!context.user.roles.includes(requiredRole)) {
    throw redirect('/');
  }
  return null;
}
```

**3. FeatureFlagGuard**

```tsx
// apps/common/router/src/guards/FeatureFlagGuard.tsx
import { Outlet, redirect } from 'react-router';
import { getFeatureFlag } from '@cangyun-ai/config';

interface FeatureFlagGuardProps {
  flag: string;
}

export function FeatureFlagGuard({ flag }: FeatureFlagGuardProps) {
  const isEnabled = getFeatureFlag(flag);

  if (!isEnabled) {
    throw redirect('/');
  }

  return <Outlet />;
}
```

### 3.7 Error Handling

**Error Boundary Hierarchy:**

```
<RouterProvider>
  <GlobalErrorBoundary>              // Catches app-wide errors
    <RootLayout>
      <RouteErrorBoundary>           // Catches route-level errors
        <FeatureErrorBoundary>       // Catches feature-specific errors
          <Component />
        </FeatureErrorBoundary>
      </RouteErrorBoundary>
    </RootLayout>
  </GlobalErrorBoundary>
</RouterProvider>
```

**1. Global Error Boundary**

```tsx
// apps/web/src/app/components/GlobalErrorBoundary.tsx
import { useRouteError, isRouteErrorResponse } from 'react-router';
import { useTranslation } from '@cangyun-ai/i18n';

export function GlobalErrorBoundary() {
  const error = useRouteError();
  const { t } = useTranslation('common');

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return <NotFoundPage />;
    }

    if (error.status === 401) {
      return <UnauthorizedPage />;
    }

    if (error.status === 500) {
      return <ServerErrorPage />;
    }
  }

  // Unknown error
  return (
    <div className="error-page">
      <h1>{t('errors.something_went_wrong')}</h1>
      <p>{error?.message || t('errors.unknown_error')}</p>
      <Link to="/">{t('actions.go_home')}</Link>
    </div>
  );
}
```

**2. Route Error Boundary** (exported from route modules)

```tsx
// In route module
export function ErrorBoundary() {
  const error = useRouteError();
  const { t } = useTranslation('chat');

  return (
    <div className="route-error">
      <h2>{t('errors.failed_to_load')}</h2>
      <p>{error?.message}</p>
      <button onClick={() => window.location.reload()}>
        {t('actions.retry')}
      </button>
    </div>
  );
}
```

### 3.8 Pending & Optimistic UI

**1. Navigation States**

```tsx
// apps/web/src/app/components/NavigationProgress.tsx
import { useNavigation } from 'react-router';
import { Progress } from '@cangyun-ai/ui';

export function NavigationProgress() {
  const navigation = useNavigation();

  if (navigation.state === 'loading') {
    return <Progress className="fixed top-0" />;
  }

  return null;
}
```

**2. Fetcher for Background Mutations**

```tsx
// In component
import { useFetcher } from 'react-router';

function RenameSessionButton({ sessionId, currentName }: Props) {
  const fetcher = useFetcher();
  const isRenaming = fetcher.state === 'submitting';

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="_action" value="rename" />
      <input name="name" defaultValue={currentName} />
      <button type="submit" disabled={isRenaming}>
        {isRenaming ? 'Saving...' : 'Rename'}
      </button>
    </fetcher.Form>
  );
}
```

**3. Integration with Apollo Optimistic Updates**

```tsx
// apps/web/src/features/chat/routes/actions.ts
export async function renameSessionAction({
  request,
  params,
}: ActionFunctionArgs) {
  const formData = await request.formData();
  const name = formData.get('name') as string;

  const result = await apolloClient.mutate({
    mutation: RenameSessionDocument,
    variables: { id: params.sessionId, name },
    optimisticResponse: {
      renameSession: {
        __typename: 'Session',
        id: params.sessionId,
        name,
      },
    },
    update(cache, { data }) {
      // Update Apollo cache
      cache.modify({
        id: cache.identify({ __typename: 'Session', id: params.sessionId }),
        fields: {
          name() {
            return data?.renameSession?.name;
          },
        },
      });
    },
  });

  return { success: true };
}
```

### 3.9 Route Metadata & Hooks

**Route Metadata via `handle`:**

```tsx
export const handle = {
  // Breadcrumb (can be function or string)
  breadcrumb: (data: LoaderData) => data.session?.title || 'Chat',

  // Analytics metadata
  analytics: {
    screen: 'chat_session',
    category: 'chat',
    properties: { feature: 'ai_chat' },
  },

  // i18n configuration
  i18n: {
    namespace: 'chat',
    titleKey: 'session_title',
  },

  // SEO metadata
  meta: {
    title: 'Chat Session',
    description: 'AI-powered chat conversation',
  },
};
```

**Hooks from `@cangyun-ai/router`:**

**1. useRouteMeta** - Set document title and meta tags

```tsx
// apps/common/router/src/hooks/useRouteMeta.ts
import { useMatches } from 'react-router';
import { useEffect } from 'react';
import { useTranslation } from '@cangyun-ai/i18n';

export function useRouteMeta() {
  const matches = useMatches();
  const { t } = useTranslation();

  useEffect(() => {
    const lastMatch = matches[matches.length - 1];
    const handle = lastMatch?.handle;

    if (handle?.meta?.title) {
      document.title = `${handle.meta.title} - Cangyun`;
    }

    if (handle?.i18n?.titleKey) {
      const translatedTitle = t(
        `${handle.i18n.namespace}:${handle.i18n.titleKey}`
      );
      document.title = `${translatedTitle} - Cangyun`;
    }
  }, [matches, t]);
}
```

**2. useRouteAnalytics** - Track page views

```tsx
// apps/common/router/src/hooks/useRouteAnalytics.ts
import { useLocation, useMatches } from 'react-router';
import { useEffect } from 'react';
import { useAnalytics } from '@cangyun-ai/analytics';

export function useRouteAnalytics() {
  const location = useLocation();
  const matches = useMatches();
  const { trackPageView } = useAnalytics();

  useEffect(() => {
    const lastMatch = matches[matches.length - 1];
    const analytics = lastMatch?.handle?.analytics;

    if (analytics) {
      trackPageView({
        path: location.pathname,
        screen: analytics.screen,
        category: analytics.category,
        properties: analytics.properties,
      });
    }
  }, [location.pathname, matches, trackPageView]);
}
```

**3. useBreadcrumbs** - Generate breadcrumb navigation

```tsx
// apps/common/router/src/hooks/useBreadcrumbs.ts
import { useMatches } from 'react-router';
import { useMemo } from 'react';

export function useBreadcrumbs() {
  const matches = useMatches();

  return useMemo(() => {
    return matches
      .filter(match => match.handle?.breadcrumb)
      .map(match => ({
        label:
          typeof match.handle.breadcrumb === 'function'
            ? match.handle.breadcrumb(match.data)
            : match.handle.breadcrumb,
        path: match.pathname,
      }));
  }, [matches]);
}
```

**Usage in App:**

```tsx
// apps/web/src/app/layouts/AuthenticatedLayout.tsx
import {
  useBreadcrumbs,
  useRouteMeta,
  useRouteAnalytics,
} from '@cangyun-ai/router';

export function AuthenticatedLayout() {
  const breadcrumbs = useBreadcrumbs();

  // Automatically set document title from route metadata
  useRouteMeta();

  // Automatically track page views
  useRouteAnalytics();

  return (
    <div>
      <Breadcrumbs items={breadcrumbs} />
      <Outlet />
    </div>
  );
}
```

## 4. Implementation Steps

### 4.1 Phase 0: Package Setup (Week 1)

**Create `@cangyun-ai/router` package:**

```bash
# Create package structure
mkdir -p apps/common/router/src/{guards,layouts,hooks}

# Initialize package.json
cd apps/common/router
pnpm init
```

**Package structure:**

```
apps/common/router/
  ├── src/
  │   ├── guards/
  │   │   ├── AuthGuard.tsx
  │   │   ├── RoleGuard.tsx
  │   │   └── FeatureFlagGuard.tsx
  │   ├── layouts/
  │   │   ├── AuthenticatedLayout.tsx
  │   │   ├── PublicLayout.tsx
  │   │   └── AdminLayout.tsx
  │   ├── hooks/
  │   │   ├── useRouteMeta.ts
  │   │   ├── useRouteAnalytics.ts
  │   │   └── useBreadcrumbs.ts
  │   └── index.ts
  ├── package.json
  └── tsconfig.json
```

**Dependencies:**

```json
{
  "name": "@cangyun-ai/router",
  "dependencies": {
    "react": "^19.1.1",
    "react-router": "^7.0.0",
    "@cangyun-ai/types": "workspace:*",
    "@cangyun-ai/hooks": "workspace:*",
    "@cangyun-ai/analytics": "workspace:*",
    "@cangyun-ai/graphql": "workspace:*",
    "@cangyun-ai/i18n": "workspace:*"
  }
}
```

### 4.2 Phase 1: Core Router Setup (Week 2)

1. **Install React Router v7:**

   ```bash
   cd apps/web
   pnpm add react-router@^7.0.0 react-router-dom@^7.0.0
   ```

2. **Create route manifest:**
   - Create `apps/web/src/app/router.tsx`
   - Set up basic structure with root layout
   - Add global error boundary

3. **Update main.tsx:**
   - Replace `App.tsx` with `RouterProvider`
   - Wrap with necessary providers (Apollo, i18n, Analytics)

4. **Create placeholder components:**
   - `SplashScreen.tsx`
   - `GlobalErrorBoundary.tsx`
   - `NotFoundPage.tsx`
   - `RootLayout.tsx`

### 4.3 Phase 2: Feature Migration (Weeks 3-4)

1. **Refactor existing chat feature:**
   - Move to `apps/web/src/features/chat/`
   - Create route modules following conventions
   - Implement loaders using `@cangyun-ai/graphql`
   - Add error boundaries
   - Add route metadata (`handle`)

2. **Test thoroughly:**
   - Unit test loaders with mocked GraphQL
   - Test error states and redirects
   - Component tests with `createMemoryRouter`

### 4.4 Phase 3: Guards & Layouts (Week 5)

1. **Implement authentication:**
   - `AuthGuard` with session check
   - `AuthenticatedLayout` with user context
   - `PublicLayout` for login/signup

2. **Add role-based access:**
   - `RoleGuard` implementation
   - Admin route protection

3. **Feature flags:**
   - `FeatureFlagGuard` implementation
   - Integration with `@cangyun-ai/config`

### 4.5 Phase 4: Advanced Features (Week 6)

1. **Analytics integration:**
   - Implement `useRouteAnalytics` hook
   - Auto-track page views from route metadata
   - Track navigation events

2. **SEO & Meta:**
   - Implement `useRouteMeta` hook
   - Dynamic document title
   - Meta tag management

3. **Breadcrumbs:**
   - Implement `useBreadcrumbs` hook
   - Add breadcrumb navigation component

4. **Optimistic UI:**
   - Integrate `useFetcher` with Apollo mutations
   - Implement optimistic updates pattern
   - Handle error rollbacks

### 4.6 Phase 5: Testing & Documentation (Week 7)

1. **Testing:**
   - Unit tests for all guards and hooks
   - Integration tests for route flows
   - E2E tests for critical paths (login → chat → logout)

2. **Documentation:**
   - Package README for `@cangyun-ai/router`
   - Route module conventions guide
   - Migration guide for existing features

3. **Performance optimization:**
   - Verify lazy loading works correctly
   - Monitor bundle size
   - Add prefetching for common routes

## 5. Testing Strategy

### 5.1 Unit Tests

**Test Route Loaders:**

```tsx
// apps/web/src/features/chat/routes/__tests__/ChatSessionRoute.test.ts
import { describe, it, expect, vi } from 'vitest';
import { loader } from '../ChatSessionRoute';
import { apolloClient } from '@cangyun-ai/graphql';

vi.mock('@cangyun-ai/graphql', () => ({
  apolloClient: {
    query: vi.fn(),
  },
}));

describe('ChatSessionRoute loader', () => {
  it('fetches session data with valid ID', async () => {
    const mockSession = { id: '123', title: 'Test Chat' };
    vi.mocked(apolloClient.query).mockResolvedValue({
      data: { session: mockSession },
    });

    const result = await loader({ params: { sessionId: '123' } });

    expect(apolloClient.query).toHaveBeenCalledWith({
      query: expect.anything(),
      variables: { id: '123' },
    });
  });

  it('throws 400 error when session ID is missing', async () => {
    await expect(loader({ params: {} })).rejects.toThrow('Session ID required');
  });
});
```

**Test Guards:**

```tsx
// apps/common/router/src/guards/__tests__/AuthGuard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { loader } from '../AuthGuard';
import { apolloClient } from '@cangyun-ai/graphql';

describe('AuthGuard', () => {
  it('returns user data when authenticated', async () => {
    vi.mocked(apolloClient.query).mockResolvedValue({
      data: { currentUser: { id: '1', name: 'Alice' } },
    });

    const result = await loader();
    expect(result).toEqual({ user: { id: '1', name: 'Alice' } });
  });

  it('redirects to /login when unauthenticated', async () => {
    vi.mocked(apolloClient.query).mockResolvedValue({
      data: { currentUser: null },
    });

    await expect(loader()).rejects.toMatchObject({
      status: 302,
      headers: { Location: '/login' },
    });
  });
});
```

### 5.2 Integration Tests

**Test Route Navigation:**

```tsx
// apps/web/src/__tests__/routing.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { router } from '../app/router';

describe('Routing integration', () => {
  it('navigates from chat list to chat session', async () => {
    const testRouter = createMemoryRouter(router.routes, {
      initialEntries: ['/chat'],
    });

    render(<RouterProvider router={testRouter} />);

    await waitFor(() => {
      expect(screen.getByText('Chat List')).toBeInTheDocument();
    });

    // Click on a chat session
    const sessionLink = screen.getByText('Test Session');
    sessionLink.click();

    await waitFor(() => {
      expect(screen.getByText('Chat Session View')).toBeInTheDocument();
    });
  });
});
```

### 5.3 E2E Tests

**Playwright Test:**

```typescript
// tests/e2e/routing.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/chat');

    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });

  test('allows authenticated user to access chat', async ({
    page,
    context,
  }) => {
    // Set auth cookie
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'test_token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('/chat');

    // Should stay on chat page
    await expect(page).toHaveURL(/\/chat/);
    await expect(page.getByText('Chat')).toBeVisible();
  });
});
```

## 6. Risks & Mitigations

| Risk                                               | Impact | Mitigation                                                 |
| -------------------------------------------------- | ------ | ---------------------------------------------------------- |
| GraphQL over-fetching in loaders                   | High   | Use `defer()` for streaming; aggressive cache policies     |
| Bundle size growth from lazy routes                | Medium | Monitor with `pnpm analyze`; set size budgets in CI        |
| Authentication flash (brief unauthenticated state) | Medium | Preload auth in root loader; use cache-first policy        |
| Route guard complexity                             | Medium | Keep guards simple; use composition over nesting           |
| Breaking changes in React Router v7                | Low    | Pin versions; thorough testing before upgrades             |
| @cangyun-ai/router package coupling                | Medium | Clear interfaces; avoid tight coupling with business logic |

## 7. Performance Considerations

### 7.1 Code Splitting

- All feature routes loaded lazily via `lazy: () => import()`
- Guards and layouts loaded eagerly (small bundles)
- Monitor bundle sizes per route

### 7.2 Data Prefetching

```tsx
// Prefetch on link hover
import { prefetchRoute } from 'react-router';

<Link to="/dashboard" onMouseEnter={() => prefetchRoute('/dashboard')}>
  Dashboard
</Link>;
```

### 7.3 Cache Strategies

- Apollo Client cache-first for auth queries
- defer() for non-critical data
- Aggressive caching for static content

## 8. Scroll Management

Use React Router's built-in scroll restoration:

```tsx
// apps/web/src/app/router.tsx
import { ScrollRestoration } from 'react-router';

export function RootLayout() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  );
}
```

**Custom scroll behavior:**

```tsx
// In chat route - keep scroll at bottom
export function ChatSessionRoute() {
  useEffect(() => {
    const main = document.querySelector('main');
    if (main) {
      main.scrollTop = main.scrollHeight;
    }
  }, [messages]);

  return <ChatView />;
}
```

## 9. Open Questions

- **File-based routing**: Should we adopt a file-system based routing convention (like Next.js) in the future, or maintain explicit manifest?
- **Feature flags in metadata**: Do we need per-route feature flags in `handle` metadata, or is guard-level sufficient?
- **Sub-app integration**: How would micro-frontend shells integrate with this router architecture?
- **SSR migration path**: What's the plan if we need to add SSR later? React Router v7 supports SSR—document migration path.

## 10. Success Criteria

- ✅ All routes use React Router v7 data APIs
- ✅ Authentication guards work correctly (no flash, proper redirects)
- ✅ Analytics auto-track all page views
- ✅ Document titles dynamically update based on route
- ✅ Error boundaries catch and display errors gracefully
- ✅ Bundle size per route stays under 100KB (gzipped)
- ✅ Test coverage >80% for guards, hooks, and loaders
- ✅ E2E tests cover critical user flows
- ✅ Developer feedback is positive (ergonomics, conventions)

---

**Next Steps:**

1. Review and approve routing architecture
2. Create `@cangyun-ai/router` package structure
3. Begin Phase 1 implementation (core router setup)
4. Migrate chat feature as proof-of-concept
5. Document conventions and patterns
6. Train team on route module best practices
