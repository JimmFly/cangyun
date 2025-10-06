# RFC-001: AI Chatbot Frontend

- **Status:** Draft
- **Date:** 2025-10-07
- **Authors:** TBD (Frontend Guild)
- **Reviewers:** Backend team, Product design, QA
- **Stakeholders:** Product, Customer Success, Data/ML

## 1. Background

We are adding an AI conversational assistant to the Cangyun platform. The backend will expose a GraphQL API (mutations for inputs, subscriptions for streaming outputs). The frontend must live inside the existing pnpm monorepo (`apps/web`) and reuse our React + Vite stack while remaining easy to extend.

## 2. Goals & Non-Goals

### 2.1 Goals

- Deliver a minimal-yet-polished chat interface consuming GraphQL mutations/subscriptions, with streaming assistant responses and contextual metadata (sources, actions).
- Keep the implementation highly extensible: components should accommodate future features (attachments, command palettes, multi-model switching) without architectural rework.
- Adopt Tailwind CSS as the primary styling layer to speed up delivery and keep responsive/dark-mode behaviour consistent.
- Provide robust error handling and retry flows for GraphQL networking issues (mutation failures, subscription reconnects).
- Instrument the experience to capture latency, usage, and user feedback signals from day one.

### 2.2 Non-Goals

- Backend orchestration of LLMs or tool-calling logic (owned by backend/ML teams).
- Conversation management outside the active session (transcript exports, admin dashboards).
- Offline storage of the entire conversation history (future enhancement).

## 3. User Experience Overview

MVP focuses on a single chat workspace:

1. **Header** – session title, model indicator, quick actions (reset, feedback, settings).
2. **Message Timeline** – scrollable list with user/assistant bubbles, streaming indicator, optional citations.
3. **Composer** – multi-line input box, send button, stop-generation control, basic slash-commands placeholder.
4. **Context Drawer (optional)** – collapsible panel showing retrieved sources or system status.

## 4. Technical Overview

### 4.1 Stack Choices (MVP)

- **Framework:** React 19 + Vite + TypeScript (strict mode enabled).
- **Routing:** React Router route at `/chat` (lazy-loaded chunk).
- **GraphQL Client:** Apollo Client 3 with HTTP link for queries/mutations and `graphql-ws` link for subscriptions. Apollo DevTools enabled in non-prod.
- **State Management:**
  - Apollo cache for remote data (sessions, messages).
  - React Context + `useReducer` for local UI state (composer, streaming flags).
- **Styling:** Tailwind CSS + PostCSS. Dark mode via `.dark` class; custom theme tokens added in `tailwind.config.ts`.
- **Code Generation:** `@graphql-codegen/cli` to emit TypeScript types and Apollo hooks from the shared schema.
- **Testing:** Vitest + React Testing Library; Playwright (follow-up) for real browser coverage.

### 4.2 Minimum Frontend Architecture

```
/apps/web
  src/
    pages/chat/ChatPage.tsx
    providers/ChatSessionProvider.tsx
    components/chat/
      ChatLayout.tsx
      MessageList.tsx
      MessageBubble.tsx
      Composer.tsx
      StreamingIndicator.tsx
      SourcePanel.tsx
    hooks/
      useChatSession.ts
      useChatSubscription.ts
      useChatAnalytics.ts
    api/
      graphqlClient.ts
      chat.gql.ts            // generated operations + types
    styles/
      tailwind.css
    types/
      chat.ts                // temporary; later import from packages/types
```

### 4.3 Frontend Data Shapes

```ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
  annotations?: Array<{
    type: 'source' | 'action';
    label: string;
    url?: string;
  }>;
  error?: boolean;
}

export interface ChatSession {
  id: string;
  title?: string;
  messages: ChatMessage[];
  metadata?: Record<string, unknown>;
}
```

### 4.4 GraphQL Schema (MVP Extract)

```graphql
type ChatSession {
  id: ID!
  title: String
  messages: [ChatMessage!]!
  metadata: JSON
}

type ChatMessage {
  id: ID!
  role: MessageRole!
  content: String!
  createdAt: DateTime!
  annotations: [MessageAnnotation!]
  error: Boolean
}

enum MessageRole {
  USER
  ASSISTANT
  SYSTEM
  TOOL
}

type MessageAnnotation {
  type: AnnotationType!
  label: String!
  url: String
}

enum AnnotationType {
  SOURCE
  ACTION
}

type Query {
  chatSession(id: ID!): ChatSession!
}

type Mutation {
  createChatSession(input: CreateChatSessionInput! = {}): ChatSession!
  sendMessage(input: SendMessageInput!): SendMessagePayload!
  cancelMessage(messageId: ID!): CancelMessagePayload!
}

type Subscription {
  chatMessageStream(sessionId: ID!): ChatMessageStreamEvent!
}

union ChatMessageStreamEvent =
  | MessageChunkEvent
  | MessageFinalEvent
  | MessageErrorEvent
  | MessageMetaEvent

type MessageChunkEvent {
  messageId: ID!
  delta: String!
}

type MessageFinalEvent {
  message: ChatMessage!
}

type MessageErrorEvent {
  messageId: ID!
  reason: String!
}

type MessageMetaEvent {
  messageId: ID!
  sources: [MessageAnnotation!]
}

input SendMessageInput {
  sessionId: ID!
  content: String!
  attachments: [String!]
  context: JSON
}

type SendMessagePayload {
  messageId: ID!
  acknowledgedAt: DateTime!
}

type CancelMessagePayload {
  messageId: ID!
  cancelledAt: DateTime!
}
```

**Client flow:**

1. `createChatSession` mutation (if no session exists yet).
2. `chatSession` query fetches history when route loads.
3. User sends prompt via `sendMessage` mutation (optimistic UI update).
4. `chatMessageStream` subscription streams events for the active session; UI aggregates chunks into the final assistant message.
5. Optional `cancelMessage` mutation stops an in-flight generation.

## 5. Component Plan (Extensible MVP)

### 5.1 `ChatPage`

- Reads `sessionId` from router; calls `createChatSession` mutation when missing.
- Wraps children in `ChatSessionProvider` and handles loading/empty/error states.

### 5.2 `ChatSessionProvider`

- Maintains reducer state `{ messages, activeMessageId, isStreaming, composer }`.
- Provides actions `appendUser`, `startAssistant`, `appendDelta`, `finalizeAssistant`, `setError`, `reset`.
- Integrates Apollo cache results with UI state (ensures rehydration on refresh).

### 5.3 `ChatLayout`

- Tailwind flex layout (header, scrollable timeline, composer).
- Handles responsive breakpoints (mobile bottom composer, desktop side context drawer).

### 5.4 `MessageList` & `MessageBubble`

- Renders messages with Tailwind utility classes for avatars, backgrounds, spacing.
- Shows streaming state by appending ellipsis/dot animation when `isStreaming` true.
- Provides optional footer for copy/feedback buttons (hidden on mobile by default).

### 5.5 `Composer`

- Tailwind-styled textarea + controls.
- Uses `useChatSession` to push optimistic user messages and trigger `sendMessage` mutation.
- Displays inline validation (length limits) and disabled state while waiting on mutation.

### 5.6 `useChatSubscription`

- Wraps Apollo `subscribeToMore` or dedicated `useSubscription` hook.
- Aggregates GraphQL events, batches frequent `MessageChunkEvent` updates with `requestAnimationFrame` to minimise re-render thrash.
- Auto-reconnects with exponential backoff and exposes connection status for UI badges.

### 5.7 `SourcePanel`

- Collapsible Tailwind card listing citations from `MessageMetaEvent` (label + optional link).
- Designed to accept future annotation types (tool outputs, actions).

## 6. Data Flow & Streaming Lifecycle

1. User submits message → `sendMessage` mutation fires (with optimistic response adding user message + pending assistant shell).
2. `chatMessageStream` subscription is active for the session; when a `MessageChunkEvent` arrives, reducer appends delta to the pending assistant message.
3. `MessageMetaEvent` updates citation panel; `MessageFinalEvent` finalises content and flips `isStreaming` to false.
4. Errors (mutation failure or `MessageErrorEvent`) mark the assistant bubble and surface retry CTA.

### 6.1 Error Handling

- Mutation error: display toast + inline retry button; keep composer content so user can resend.
- Subscription drop: show banner "Reconnecting…" and retry automatically; after 3 failures, expose manual retry.
- Model/tool error (from `MessageErrorEvent`): render assistant bubble with warning styling and explanation text.

### 6.2 Cancellation

- Composer shows "Stop generating" when assistant is streaming; triggers `cancelMessage` mutation and unsubscribes from the specific message ID.
- Upon cancellation, reducer finalises the message with a `cancelled` flag and allows user to retry or edit prompt.

## 7. Styling & Tailwind Implementation

1. Install `tailwindcss`, `postcss`, `autoprefixer` in `apps/web` (dev deps).
2. Generate `tailwind.config.ts` with `content` pointed at `src/**/*.{ts,tsx}` and extend theme with base spacing/colors.
3. Create `src/styles/tailwind.css` importing `@tailwind base; @tailwind components; @tailwind utilities;` and include global resets (scrollbars, fonts).
4. Wrap root `<html>` with dark-mode toggle class (`document.documentElement.classList.toggle('dark')`).
5. Introduce Tailwind component patterns (e.g., `.bubble-user`, `.bubble-assistant`) via `@layer components` for consistent styling.

## 8. Accessibility & Localisation

- Use semantic roles: `role="log"` for message list, `aria-live="polite"` for assistant streaming updates.
- Ensure keyboard navigation: focus trap around composer, shortcuts (Ctrl+Enter send, Esc cancels streaming).
- Integrate `react-i18next` (lightweight setup) with translation namespaces `chat` and `common`.
- Provide locale-aware date formatting for timestamps using `Intl.DateTimeFormat`.

## 9. Analytics & Telemetry

- Emit events (`chat.message_sent`, `chat.message_completed`, `chat.error`, `chat.stop_generation`, `chat.copy`) through a `useChatAnalytics` hook.
- Include metadata: `sessionId`, `messageId`, prompt length, mutation latency, subscription duration, reconnect counts.
- Surface metrics to analytics provider asynchronously to avoid blocking UI thread.

## 10. Security & Privacy

- Reuse existing auth headers when creating Apollo links (JWT/Session cookie).
- Sanitize/render markdown safely (if enabled) to prevent XSS; disallow HTML in assistant responses unless backend guarantees safety.
- Mask sensitive tokens (detected via backend annotations) before displaying or copying.
- Avoid logging raw prompts in production builds.

## 11. Testing Strategy

- **Unit:** reducers, hooks (`useChatSubscription`, `useChatSession`), utility formatters.
- **Component:** React Testing Library for `Composer`, `MessageList`, ensuring streaming renders correctly.
- **Integration:** Mock GraphQL server with subscriptions (e.g., `msw` + `graphql-ws`) to validate end-to-end flows.
- **Future E2E:** Playwright scenario covering happy path, network failure, cancellation.

## 12. Performance Considerations

- Batch subscription updates; only rerender affected message nodes.
- Use `React.Suspense` + lazy imports for heavy components (SourcePanel) to keep initial bundle light.
- Paginate historical messages (initial load last 20, offer "Load older" button).
- Defer analytics/network work to `requestIdleCallback` when possible.

## 13. Deployment & Release

- Feature flag the chat route; release to internal beta first.
- Validate GraphQL schema alignment with backend contract in CI (Codegen + lint).
- Ensure build pipeline includes Tailwind CLI step via Vite plugin or PostCSS integration.

## 14. Timeline (Minimal, Extensible Plan)

- **Week 1:** Finalise UX, integrate Tailwind, scaffold Chat route, configure Apollo (HTTP + WS) and GraphQL codegen.
- **Week 2:** Implement core components (ChatPage, MessageList, Composer), wire mutations + subscription streaming.
- **Week 3:** Add error handling, cancellation, analytics hook, basic tests.
- **Week 4:** Polish UI (responsive/dark mode), accessibility pass, beta rollout with monitoring.

## 15. Risks & Mitigations

- **Subscription instability:** add retry/backoff logic and fallback polling strategy.
- **Schema drift:** run GraphQL codegen in CI; fail build on breaking changes.
- **Design churn:** modular Tailwind components allow rapid iteration without refactoring logic.
- **Performance under long sessions:** virtualise list when messages exceed threshold; persist summary to backend.

## 16. Open Questions

- Do we need attachments or tool-call UI in MVP, or postpone to v2?
- Should assistant responses support rich text/markdown or remain plain text initially?
- Preferred analytics provider (Posthog vs Segment)?
- How will session persistence/auth work across tabs (same session ID or new one per tab)?
