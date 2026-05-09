# OpenRouter Failure Handling — Design

## Problem (issue #651)

Two distinct failures when using OpenRouter free-tier models in chat:

1. `AI_RetryError`: "Failed after 3 attempts. Last error: Provider returned error" — masks the real HTTP status (429/5xx). Free tier rate-limits at 50 req/day, 20 req/min per IP; user sees only "Provider returned error".
2. `AI_APICallError`: "Failed to process successful response" — some OpenRouter free providers (e.g. inclusionAI Ring-1T) emit SSE chunks the AI SDK's parser rejects. Stream returns 200 OK but no `text-delta` events.

## Goals

1. **Surface real error details** — propagate HTTP status + body snippet so users see "HTTP 429 (rate limited)" instead of "Provider returned error".
2. **Pre-flight free-tier warning** — when adding/saving an OpenRouter provider, hit `/v1/auth/key` and warn if the key is on the free tier.
3. **Fallback to `generateText`** — when `streamText` throws a parser-class error before any chunk yielded, retry once via `generateText`. Surface result as a single yield. If fallback also fails, surface the original (improved) error.

## Non-goals

- Retry policy changes (still 1 retry for transient empty-body).
- New UI surface for daily-quota status.
- Mid-stream recovery (only pre-yield fallback).

## Module layout

- `src/services/ai/aiServiceErrors.ts` (new)
  - `extractErrorDetails(error: unknown): { status?: number; body?: string; isRateLimit: boolean; isParserError: boolean; isEmptyBody: boolean; underlying: unknown }`
  - `humanizeStreamError(error: unknown): string`
  - Walks `AI_RetryError.errors` / `AI_RetryError.lastError`, recognises `AI_APICallError` (`statusCode`, `responseBody`, `url`), `AI_EmptyResponseBodyError`.
- `src/services/ai/openrouterPreflight.ts` (new)
  - `isOpenRouterBaseURL(baseURL: string): boolean` — true when host endsWith `openrouter.ai`.
  - `checkOpenRouterKey(baseURL, apiKey): Promise<{ isFreeTier: boolean; limit: number | null; usage: number | null } | null>` — null when not OpenRouter or call fails.
- `src/services/AIService.ts`
  - Replace inline `humanizeStreamError` and `isEmptyResponseError` with imports from `aiServiceErrors`.
  - In `streamChatResponse`, after the empty-body retry block, attempt one `generateText` fallback when `!yielded` and `isParserError` (or `isEmptyBody` after retry already consumed). On fallback success, yield `result.text` and serialize each `toolCall`. On fallback failure, throw original humanized error.
- `src/components/ai/ProviderConfigModal.tsx`
  - In the existing "Test connection" path (which already hits `/v1/models`), additionally call `checkOpenRouterKey`. If `isFreeTier`, append a warning to the success Alert: "OpenRouter free tier — daily limit of N req/day. Streaming may fail when exhausted."

## Test plan

Unit tests (`__tests__/ai/aiServiceErrors.test.ts`):

1. `extractErrorDetails` returns status 429 from an `AI_APICallError` with `statusCode: 429`.
2. Walks `AI_RetryError.errors[last].statusCode` to find inner status.
3. Walks `AI_RetryError.lastError` when no `errors` array.
4. `isRateLimit` true when status is 429.
5. `isParserError` true for `AI_APICallError` with `statusCode` 200 + non-empty body, false for HTTP errors.
6. `isEmptyBody` true for `AI_EmptyResponseBodyError` (direct or via `cause`).
7. `humanizeStreamError` formats: `"HTTP 429 (rate limited): <body snippet ≤200 chars>"` for rate-limit; `"HTTP 5xx: ..."` for server errors; `"The provider returned a successful response the SDK could not parse."` for parser errors; existing empty-body copy preserved.

Unit tests (`__tests__/ai/openrouterPreflight.test.ts`):

1. `isOpenRouterBaseURL` matches `https://openrouter.ai/api/v1`, `https://openrouter.ai/api/v1/`, mixed case, ignores trailing slash.
2. `isOpenRouterBaseURL` false for `https://api.openai.com`, `https://anthropic.openrouter.fake.com`.
3. `checkOpenRouterKey` returns `null` for non-OpenRouter URL.
4. `checkOpenRouterKey` returns `{ isFreeTier: true, limit: 50, usage: 12 }` for a stubbed `/v1/auth/key` response.
5. `checkOpenRouterKey` returns `null` if fetch fails (never throws).

Integration test (`__tests__/ai/streamChatResponse.test.ts`):

Mock the `ai` module (`streamText` + `generateText`).

1. Stream yields text chunks → consumer receives them, no fallback.
2. Stream throws `AI_APICallError` with `statusCode: 200` (parser error), `generateText` returns `"hello world"` → consumer receives `"hello world"`.
3. Stream throws `AI_APICallError` with `statusCode: 429` → consumer sees thrown error containing `"429"`.
4. Stream throws `AI_EmptyResponseBodyError` → first retry; on second failure with parser shape, fallback runs.
5. Fallback `generateText` itself throws → consumer sees original (humanized) stream error, not fallback error.

## Risks / tradeoffs

- Fallback doubles the upstream-call cost on parser failures. Mitigated by only triggering when `!yielded` and parser-class error, not on rate-limit.
- `generateText` fallback drops streaming UX (single yield, no progressive render) — acceptable; the alternative is a hard error.
- `checkOpenRouterKey` adds one extra HTTP call to the test-connection flow — fast, ignored on failure.
- Tools: fallback passes `tools` through and serializes any `toolCalls` from `result.toolCalls` using existing `serializeToolEvent` shape; if upstream omits tool calls, behaviour matches direct streaming.
