# Codebase Optimization Review

## Backend

### Missing runtime validation on `/api/v1/chat`

- **Evidence:** `backend/src/chat/dto/chat-request.dto.ts:1-12` only declares TypeScript interfaces, and `backend/src/chat/chat.controller.ts:22-53` consumes `@Body()` without any Nest `ValidationPipe` or schema guard. `backend/src/main.ts:8-70` never installs a global pipe either.
- **Impact:** Requests can reach multi-agent orchestration with missing `question`, negative `topK`, or malformed `history`, which contradicts the “Schema everywhere” guideline and makes downstream error handling unpredictable.
- **Recommendation:** Introduce a Zod schema (e.g., in `apps/common/types`) plus a reusable validation pipe, or switch DTOs to `class-validator` classes and enable `app.useGlobalPipes(new ValidationPipe({ whitelist: true }))` so every chat request is sanitized before hitting business logic.

### SSE contract lacks shared schema

- **Evidence:** `backend/src/chat/chat.controller.ts:37-158` handcrafts JSON envelopes with string literals such as `'status'`, `'sources'`, `'delta'`, `'done'`, `'error'`. The frontend re-parses the same literals in `apps/web/src/features/chat/utils/custom-chat-transport.ts:133-199`.
- **Impact:** Because these event shapes are duplicated across services with stringly typed code, a change in one side silently breaks the other, and TypeScript cannot help—there is no shared type or test to detect drift.
- **Recommendation:** Define the SSE event union (e.g., `{ type: 'delta'; data: string } | ...`) under `apps/common/types` with Zod validation. Reuse it in the controller and the transport so both compiler and tests enforce the streaming contract.

### Unsafe embedding serialization in Postgres repository

- **Evidence:** `backend/src/knowledge/postgres-knowledge.repository.ts:113-155` interpolates `embeddingSql` into the `INSERT` string instead of passing it as a bound parameter.
- **Impact:** Although embeddings are numeric, string interpolation bypasses pg’s parameter sanitization, inviting malformed SQL and making it hard to swap storage engines (e.g., `pgvector`) later. It also violates the repo’s “configuration first / schema everywhere” standard.
- **Recommendation:** Store vectors using parameter placeholders—`$6::vector`—and supply the numeric array directly (pgvector supports this), or use parameterized `pg-format` helpers so no SQL is constructed manually.

### Multi-agent orchestration lacks targeted tests

- **Evidence:** `backend/src/chat/chat.service.ts:41-222` implements retryable multi-agent streaming, but there are no `*.spec.ts` files under `backend/src/chat/` (only the root `app.controller.spec.ts` exists).
- **Impact:** Critical behaviors—status events, resumable streams, fallback generation—cannot be regression-tested, yet they interact with external providers and SSE framing. Bugs in retry logic or knowledge merging would surface only in production.
- **Recommendation:** Add Jest specs or contract tests near `chat.service.ts` that stub `KnowledgeAgentService`, `ExternalAgentService`, and `CoordinatorAgentService`, exercising success, failure, and resume paths. Capture SSE envelopes to ensure they align with the shared schema noted above.

## Frontend

### Attachment pipeline is incomplete

- **Evidence:** `apps/web/src/components/ai-elements/prompt-input.tsx:455-714` carefully tracks attachments, converts blob URLs to data URLs, and passes them through `PromptInput`’s `onSubmit`. However, `apps/web/src/features/chat/routes/ChatRoute.tsx:206-214` ignores the `_message` argument entirely, and `apps/web/src/features/chat/utils/custom-chat-transport.ts:40-58` only serializes text parts when constructing the payload. The backend DTO (`backend/src/chat/dto/chat-request.dto.ts:8-12`) also has no file fields.
- **Impact:** Users can add files in the UI but nothing is ever sent or persisted; worse, the silent drop encourages a false sense of functionality and unnecessary client work.
- **Recommendation:** Decide on an attachment contract (e.g., base64 metadata) shared between frontend transport and backend DTO, persist it in `ChatRequestDto`, and update `ChatRoute` to forward `PromptInputMessage` content instead of discarding it.

### `PromptInput` monolith and `any` usage

- **Evidence:** `apps/web/src/components/ai-elements/prompt-input.tsx:1-1140` bundles provider setup, drag/drop, file system access, keyboard handling, and speech recognition in a single file. The bespoke `SpeechRecognition` declarations at `apps/web/src/components/ai-elements/prompt-input.tsx:1084-1097` fall back to `any`, violating the repo’s “禁止使用 any” rule.
- **Impact:** The component is effectively untestable, props are tightly coupled, and future changes (e.g., swapping the speech button) risk regressions everywhere. The loose typing also defeats TypeScript’s safety promises.
- **Recommendation:** Split the module into focused files (provider/hook, attachments list, speech controls, form shell) and replace the custom interfaces with the official DOM lib definitions (`window.SpeechRecognition`). Enforce `no-explicit-any` for this package to keep the codebase honest.

### Redundant chat state and loose error typing

- **Evidence:** `apps/web/src/features/chat/routes/ChatRoute.tsx:64-159` maintains a bespoke `pending` flag plus `setTimeout` logic to mirror `useChat`’s `status`, and `apps/web/src/features/chat/routes/ChatRoute.tsx:161-182` casts message parts to `{ type?: string; errorText?: unknown }` just to detect errors.
- **Impact:** Duplicated state invites race conditions (e.g., pending toggled after unmount) and spreads `any`-style casts throughout the feature, instead of relying on the SDK’s `error` surface or a discriminated union for SSE payloads.
- **Recommendation:** Derive UI states from `status`/`error` provided by `useChat` and typed SSE events. Remove the manual `pending` state machine and replace the `partAny` casts with well-defined payload types.

### Transport strips structured history

- **Evidence:** `apps/web/src/features/chat/utils/custom-chat-transport.ts:33-69` rebuilds the payload by concatenating only the `text` parts of each message and discarding any non-text parts or tool outputs, eventually sending `{ question, history, topK }`.
- **Impact:** Tool outputs, citations, and future multimodal parts never reach the backend, so server-side context (and attachments once implemented) cannot be reconstructed. This also makes it impossible to use the Vercel AI SDK’s more advanced message formats.
- **Recommendation:** Send the entire `UIMessage` array (or a normalized DTO) to the server, letting the backend derive `question`, tool calls, and attachments. That keeps the transport thin and aligns with React best practices (“derive data where it’s produced”).

## Tooling / Scripts

### `scripts/knowledge/ingest-yuque.ts` relies on `any` and untyped recursion

- **Evidence:** `responseListener` at `scripts/knowledge/ingest-yuque.ts:86-109`, the sheet helpers at `scripts/knowledge/ingest-yuque.ts:758-865`, and OCR bootstrap at `scripts/knowledge/ingest-yuque.ts:989-1053` all declare parameters and sets as `any`.
- **Impact:** The ingestion pipeline cannot benefit from TypeScript or unit tests; a single unexpected DOM shape will crash the run late in the process. This contradicts the repo instruction “关于 TypeScript... 禁止使用 any”.
- **Recommendation:** Extract the sheet parsing/OCR logic into typed helper modules (e.g., `SheetParser`, `OcrClient`), model the Yuque responses with Zod, and add Vitest/Jest specs under `scripts/knowledge/__tests__` so regressions are caught without re-running Playwright.
