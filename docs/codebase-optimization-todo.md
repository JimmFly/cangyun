# Codebase Optimization – TODO Checklist

> Derived from the findings in `docs/codebase-optimization-review.md` / `docs/codebase-optimization-review-zh.md`.

## Backend

1. **Chat request validation**
   - Introduce runtime validation (Zod or `class-validator`) for `ChatRequestDto`.
   - Register a global `ValidationPipe` so `/api/v1/chat` rejects invalid payloads before hitting `ChatService`.
2. **Shared SSE schema**
   - Define the event union (`status`, `sources`, `delta`, `done`, `error`) under `apps/common/types`.
   - Update `ChatController` and `CustomChatTransport` to consume the shared type instead of string literals.
3. **Safe vector persistence**
   - Replace the string interpolation in `PostgresKnowledgeRepository` with parameterized inserts (pgvector-friendly).
4. **Multi-agent regression tests**
   - Add Jest specs for `chat.service.ts` that stub `KnowledgeAgentService`, `ExternalAgentService`, and `CoordinatorAgentService`, covering success/failure/resume scenarios and SSE envelopes.

## Frontend

5. **Attachment contract**
   - Extend `PromptInput` → `ChatRoute` → `CustomChatTransport` so attachments (base64 + metadata) are forwarded to the backend DTO and ultimately to `ChatService`.
6. **PromptInput refactor**
   - Split the monolithic component into provider, attachment list, speech controls, and form shell.
   - Remove the ad-hoc `SpeechRecognition` interfaces and eliminate all `any` usage (enforce `no-explicit-any` in this package).
7. **Chat state derivation**
   - Drop the manual `pending` state machine and rely on `useChat`’s `status`/`error`.
   - Replace loose part casting with the shared SSE/error discriminated unions.
8. **Transport payload fidelity**
   - Send the complete `UIMessage` array (or a normalized DTO) from `CustomChatTransport`, preserving non-text/tool/attachment parts so the backend can reconstruct context.

## Scripts / Tooling

9. **Typed Yuque ingestion**
   - Move sheet parsing + OCR helpers into typed modules, remove `any`, and add unit tests (Vitest/Jest) under `scripts/knowledge/__tests__` to cover the recursive parsing paths.
