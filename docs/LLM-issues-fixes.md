# LLM Integration: Issues & Fixes

A field-notebook of every problem we hit wiring up the chat layer and what
the actual fix turned out to be. Searchable by error message — if you see
one of these strings in your logs, jump to the matching section.

---

## Table of contents

1. [`Unsupported model version v3 ... AI SDK 5 only supports v2`](#1-unsupported-model-version-v3)
2. [`Failed to initialize model "..." requires provider configuration`](#2-failed-to-initialize-model-requires-provider-configuration)
3. [`AI_EmptyResponseBodyError` from Z.AI](#3-ai_emptyresponsebodyerror-from-zai)
4. [`AI_EmptyResponseBodyError` from DeepSeek](#4-ai_emptyresponsebodyerror-from-deepseek)
5. [Apple Foundation Model: `.exceededContextWindowSize`](#5-apple-foundation-model-exceededcontextwindowsize)
6. [Apple Foundation Model: `GenerationError -1` in iOS Simulator](#6-apple-foundation-model-generationerror--1-in-ios-simulator)
7. [Empty assistant bubble after stream completes](#7-empty-assistant-bubble-after-stream-completes)
8. [Tool calls silently no-op (AI SDK v5 rename)](#8-tool-calls-silently-no-op-ai-sdk-v5-rename)
9. [Markdown unreadable in dark mode](#9-markdown-unreadable-in-dark-mode)
10. [GitHub `409 Conflict` on save / delete](#10-github-409-conflict-on-save--delete)
11. [`CoreMessage` deprecation warning](#11-coremessage-deprecation-warning)
12. [Streaming bubble resize jump](#12-streaming-bubble-resize-jump)
13. [Attached files lost after first turn](#13-attached-files-lost-after-first-turn)
14. [Token-budget warning underestimates real usage](#14-token-budget-warning-underestimates-real-usage)
15. [Auto-title clobbers manual rename](#15-auto-title-clobbers-manual-rename)
16. [Stream cannot be cancelled](#16-stream-cannot-be-cancelled)

---

## 1. `Unsupported model version v3`

**Symptom**

```
Failed to stream chat response: Unsupported model version v3 for
provider "custom-...". AI SDK 5 only supports models that implement
specification version "v2".
```

**Root cause**

`@ai-sdk/openai-compatible@2.x` was published targeting AI SDK 6 — it
emits `LanguageModelV3` instances. The `^2.0.45` semver range we had in
`package.json` resolved to that line, but `ai@5.0.183` only accepts
`LanguageModelV2`.

**Fix**

Pin `@ai-sdk/openai-compatible` to the latest 1.x release (`^1.0.39`)
which depends on `@ai-sdk/provider@2.x` and emits V2 models.

```jsonc
// package.json
"@ai-sdk/openai-compatible": "^1.0.39",
```

> When upgrading to AI SDK 6 in the future, also bump openai-compatible to
> 2.x and wherever else we cast `LanguageModelV2`/`V3`.

**References**: [AI SDK Troubleshooting][ai-sdk-troubleshoot] · commit `599508c`.

[ai-sdk-troubleshoot]: https://ai-sdk.dev/docs/troubleshooting/unsupported-model-version

---

## 2. `Failed to initialize model ... requires provider configuration`

**Symptom**

```
Failed to initialize model "glm-5.1": OpenAI-compatible model "glm-5.1"
requires provider configuration
```

shown even though the provider exists in settings.

**Root cause**

`ProviderConfigModal` generated the provider id with
`custom-${Date.now()}` **twice** — once at "Test connection" (stamped
onto each discovered model's `providerId`) and again at "Save"
(stamped onto the provider). Different timestamps → models pointed at
a non-existent provider id.

**Fix**

- Compute `providerId` once in `handleSave`, then re-stamp every
  discovered model with that single id before persisting.
- Add a self-heal pass in `aiStore.getSelectedModel` that locates the
  selected model by id within `providers` and overrides its
  `providerId` to match the actual containing provider — so existing
  broken state recovers on next read.

**References**: `src/components/ai/ProviderConfigModal.tsx`,
`src/stores/aiStore.ts:getSelectedModel`. Commits `599508c`, `86f682d`.

---

## 3. `AI_EmptyResponseBodyError` from Z.AI

**Symptom**

```
[AI_APICallError: Failed to process successful response]
cause: { [AI_EmptyResponseBodyError: Empty response body] }
url: 'https://api.z.ai/api/coding/paas/v4/chat/completions'
```

HTTP 200 with zero-byte body when streaming GLM with tools attached.

**Root cause**

Z.AI Coding Plan requires a non-standard request body field
**`tool_stream: true`** alongside `stream: true` when streaming with
tools. AI SDK doesn't add it — Z.AI's edge silently returns empty.

**Fix**

A `ProviderQuirk` in `src/services/ai/providerQuirks.ts` matches any
`api.z.ai`-shaped baseURL and injects `tool_stream: true` via a custom
`fetch` middleware passed to `createOpenAICompatible`.

```ts
{
  id: 'z.ai',
  matches: (url) => /(^|\.)z\.ai($|\/|:)/i.test(url),
  transformRequestBody: (body) => {
    if (Array.isArray(body.tools) && body.tools.length > 0) {
      body.tool_stream = true;
    }
  },
}
```

**References**: [Z.AI tool_stream feature request][zai-tool-stream] · commits `e268d8f`, `c9d0a76`.

[zai-tool-stream]: https://github.com/openclaw/openclaw/issues/18135

---

## 4. `AI_EmptyResponseBodyError` from DeepSeek

**Symptom**

Same `AI_APICallError → AI_EmptyResponseBodyError`, but URL is
`https://api.deepseek.com/chat/completions`.

**Root cause**

DeepSeek's own docs acknowledge it: under high load the API returns
HTTP 200 with an empty body (or only SSE keep-alive comments) for
non-streaming requests. There's no provider-side flag to fix it.

**Fix**

`streamChatResponse` retries **once** on `AI_EmptyResponseBodyError`,
but only if no chunks have been yielded yet (no risk of duplicated
content). The thrown error is also rewritten to a human-readable
string so the user sees a useful suggestion instead of "Failed to
process successful response".

```ts
function isEmptyResponseError(error: unknown): boolean { /* ... */ }

for (let attempt = 0; attempt < 2; attempt++) {
  let yielded = false;
  try { /* stream */ }
  catch (error) {
    if (!yielded && attempt === 0 && isEmptyResponseError(error)) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    throw new Error(humanizeStreamError(error));
  }
}
```

If retry still fails, the user is told it may be provider load, an
invalid model name, or a tools-incompatible request — and to try a
different model.

**References**: [DeepSeek API docs][deepseek-docs] · [Aider-AI/aider#3385][aider-deepseek] · commit `90e8593`.

[deepseek-docs]: https://api-docs.deepseek.com/
[aider-deepseek]: https://github.com/Aider-AI/aider/issues/3385

---

## 5. Apple Foundation Model: `.exceededContextWindowSize`

**Symptom**

The on-device Apple model rejects the request once the conversation +
attached context grows past **4,096 tokens** (input + output combined).
Hard limit; iOS 26.4 added APIs to read it (`SystemLanguageModel.contextSize`,
`tokenCount(for:)`) but cannot raise it.

**Fix**

`src/services/ai/modelLimits.ts` declares per-provider budgets:

```ts
const APPLE_LIMIT = { totalTokens: 4096, reservedTokens: 1500, label: 'Apple on-device (4K total)' };
```

`ChatScreen` sums attached context bytes + history text bytes + a
600-byte system-prompt baseline, runs `checkContextBudget`, and the
input bar shows an inline warning at >60% (caution) and a red banner at
>100% (over). Users can still send if they ignore the warning, but they
won't be surprised by a silent failure.

**References**: [Apple TN3193][tn3193] · `src/services/ai/modelLimits.ts`.

[tn3193]: https://developer.apple.com/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window

---

## 6. Apple Foundation Model: `GenerationError -1` in iOS Simulator

**Symptom**

```
ERROR  The operation couldn't be completed.
       (FoundationModels.LanguageModelSession.GenerationError error -1.)
[ModelManagerServices] Passing along Model Catalog error:
       Error Domain=com.apple.UnifiedAssetFramework Code=5000
       "There are no underlying assets ... for asset set
        com.apple.modelcatalog"
```

**Root cause**

The iOS Simulator does not provision Apple Intelligence model assets.
The Foundation Models framework cannot find a downloaded model.

**Fix**

Not a code bug. Test on a real device with Apple Intelligence enabled,
or pick a different provider (Llama on-device, or any OpenAI-compatible
endpoint). README/`docs/ai-chat.md` calls this out.

---

## 7. Empty assistant bubble after stream completes

**Symptom**

Stream ends, no error, but the assistant bubble is blank. User sees a
silent empty message.

**Root cause**

Multiple compounding causes, fixed in layers:

1. **AI SDK v5 changed `text-delta` shape**: property is now `part.text`,
   not `part.textDelta`. Our chunk handler kept checking `textDelta`
   and yielded zero strings.
2. **Stream `error` parts swallowed**: AI SDK emits `{ type: 'error' }`
   parts that we ignored, so a 401/timeout completed "successfully"
   with no text.
3. **Empty-completion fallback only fired when `handledToolCount > 0`**,
   so a model that returned nothing AND called no tool left the bubble
   empty silently.

**Fix**

```ts
// AIService.ts
if (part.type === 'text-delta' || part.type === 'text') {
  const delta = typeof part.text === 'string' ? part.text : part.textDelta;
  if (typeof delta === 'string' && delta.length > 0) yield delta;
  continue;
}
if (part.type === 'error') {
  throw new Error(/* ... */);
}
```

```ts
// ChatScreen.tsx — fallback always fires now
if (!assistantText.trim() && !pausedForConfirmation) {
  updateMessage(assistantMessageId, {
    content: handledToolCount > 0 ? 'Done.' : 'No response received.',
  });
}
```

**References**: commits `86f682d`.

---

## 8. Tool calls silently no-op (AI SDK v5 rename)

**Symptom**

Model intends to call a tool but nothing happens — no UI, no execution.

**Root cause**

AI SDK v5 renamed tool stream events:

| v4                            | v5                  |
| ----------------------------- | ------------------- |
| `tool-call-streaming-start`   | `tool-input-start`  |
| `tool-call-delta`             | `tool-input-delta`  |
| `argsTextDelta`               | `delta`             |
| `result`                      | `output`            |
| `toolCallId`                  | `id`                |

Our `serializeToolEvent` only matched the v4 names; v5 events fell
through to `default` and were dropped.

**Fix**

`serializeToolEvent` in `AIService.ts` accepts both naming schemes and
normalizes them to the v4 shape that `ChatScreen` consumes — minimal
churn at the call site.

**References**: commits `86f682d`.

---

## 9. Markdown unreadable in dark mode

**Symptom**

Dark theme. Assistant bubble shows white-on-white text — markdown
content is rendered with white background regardless of theme.

**Root cause**

`react-native-marked@v8` (and v7) sets a hard FlatList background:

```js
// node_modules/react-native-marked/.../Markdown.js
style: {
  backgroundColor: colorScheme === "light" ? "#ffffff" : "#000000"
}
```

It also uses `useColorScheme()` from `react-native`, which can return
the wrong value in nested theme contexts.

**Fix**

Override at the component level:

```ts
const markdownTheme = {
  colors: {
    text: textColor,
    code: textColor,
    link: colors.primary,
    border: isDark ? '#444' : '#ddd',
    background: 'transparent' as const,
  },
};
const markdownStyles: MarkedStyles = {
  paragraph: { backgroundColor: 'transparent', ... },
  text: { color: textColor, backgroundColor: 'transparent' },
  // ...
};
const markdownFlatListProps = {
  style: { backgroundColor: 'transparent' },
  contentContainerStyle: { backgroundColor: 'transparent' },
  scrollEnabled: false,
};
```

`scrollEnabled: false` also sidesteps the nested-FlatList warning since
the chat list already scrolls.

**References**: `src/components/ai/ChatMessageBubble.tsx`.

---

## 10. GitHub `409 Conflict` on save / delete

**Symptom**

```
Error deleting chat thread: [AxiosError: Request failed with status code 409]
```

or the same on save during a streaming reply.

**Root cause**

`saveThread` reads the existing file's sha, then PUTs back with that
sha. If a previous concurrent save updated the file between the read
and the PUT, GitHub returns 409 (sha mismatch). Same for DELETE.

**Fix**

`putFile` and `deleteFile` in `ChatStorageService.ts` retry up to
`GITHUB_WRITE_RETRIES` (3) times: re-fetch the latest sha, back off
exponentially (250 / 500 ms), retry. `deleteFile` additionally treats
404 as success (already gone).

```ts
for (let attempt = 0; attempt < GITHUB_WRITE_RETRIES; attempt++) {
  try { /* PUT or DELETE */ return; }
  catch (error) {
    const status = getStatus(error);
    if ((status === 409 || status === 422) && attempt < GITHUB_WRITE_RETRIES - 1) {
      const latest = await getFile(...);
      sha = latest?.sha;
      await delay(250 * (attempt + 1));
      continue;
    }
    throw error;
  }
}
```

The chat-thread-list delete handler also wraps the call in
`githubActivity.begin('Deleting chat…') / end()` so the global
`GitHubActivityIndicator` pill shows progress.

**References**: commits `19f9f21`, `86f682d`. Tunable: `GITHUB_WRITE_RETRIES` in `src/services/ai/config.ts`.

---

## 11. `CoreMessage` deprecation warning

**Symptom**

```
[6385] 'CoreMessage' is deprecated.
```

**Root cause**

AI SDK 5 renamed `CoreMessage` → `ModelMessage`.

**Fix**

```ts
import type { LanguageModel as LanguageModelV1, ModelMessage, Tool } from 'ai';

export async function* streamChatResponse(
  model: LanguageModelV1,
  messages: ModelMessage[], // was CoreMessage[]
  /* ... */
)
```

---

## 12. Streaming bubble resize jump

**Symptom**

Bubble appears with "Thinking..." spinner (~120 px wide), then markdown
content swaps in at a different width — visible shrink-then-grow jolt.
On long replies the bubble also re-renders on every character chunk
which makes the jolt worse.

**Fix**

Two changes:

1. Replace the spinner+text placeholder with a standalone three-dot
   typing indicator outside the bubble (no surface, no padding).
   The actual bubble only appears once the first content chunk arrives,
   so growth is monotonic.
2. Throttle text deltas to at most one bubble update per
   `STREAM_RENDER_FLUSH_MS` (80 ms) using a `setTimeout` accumulator.
   `ChatMessageBubble` is wrapped in `React.memo` with an id+content
   comparator so other bubbles don't re-render at all during streaming.

**References**: `ChatScreen.streamAssistantResponse`,
`ChatMessageBubble`. Tunable: `STREAM_RENDER_FLUSH_MS` in `config.ts`.

---

## 13. Attached files lost after first turn

**Symptom**

User attaches a file via the paperclip on turn 1. Model reads it. On
turn 2 the model claims it has no access to that file. User has to
re-attach.

**Root cause**

`streamAssistantResponse` built the system prompt from the current
`attachedContexts` React state — which is cleared after send. The
context only existed in turn 1's prompt; the AI's later context is
just chat history (which doesn't carry the file content).

**Fix**

```ts
const aggregatedContexts = dedupeContexts([
  ...runtimeThread.messages.flatMap((m) => m.attachedContexts ?? []),
  ...contexts,
]);
const contextString = aggregatedContexts.length
  ? await buildContextString(aggregatedContexts)
  : undefined;
```

Every turn now re-fetches and packs **all unique contexts ever attached
in the thread**, deduped by `type:owner/repo/path@branch`. The token
budget warning factors this growing context, so users see when they're
about to bust the model's limit.

---

## 14. Token-budget warning underestimates real usage

**Symptom**

Apple's 4K hard limit hit silently — the budget warning never fired
even though the conversation was already well past 3,000 tokens.

**Root cause**

`checkContextBudget` only counted attached-context bytes. History text
bytes, accumulated tool-call results, and the system prompt itself
were ignored.

**Fix**

```ts
const attachedBytes = attachedContexts.reduce((acc, c) => acc + (c.approxBytes || 0), 0);
const historyAttachedBytes = (thread?.messages ?? [])
  .flatMap((m) => m.attachedContexts ?? [])
  .reduce((acc, c) => acc + (c.approxBytes || 0), 0);
const historyTextBytes = (thread?.messages ?? []).reduce(
  (acc, m) => acc + (m.content?.length || 0) + (m.toolCallResult?.length || 0),
  0,
);
const totalBytes = attachedBytes + historyAttachedBytes + historyTextBytes + 600; // system-prompt baseline
```

Token estimate uses `BYTES_PER_TOKEN = 4` (English heuristic). Multi-byte
inputs (emoji, CJK) under-count tokens — acceptable for a heads-up
warning.

---

## 15. Auto-title clobbers manual rename

**Symptom**

User renames a thread to "Important meeting" while the first response is
still streaming. After streaming completes, the AI-generated title
overwrites the rename.

**Root cause**

The auto-title routine captured the thread reference at scheduling
time and didn't re-check the current title at apply time.

**Fix**

```ts
const title = await AIService.generateChatTitle(...);
if (!title) return;
const fresh = useChatStore.getState().activeThread;
if (fresh?.id === latest.id && fresh.title === 'New Chat') {
  renameThread({ threadId: latest.id, title });
  await saveActiveThread();
}
```

Re-reads the store state after the AI call resolves; only renames if
the user hasn't already done it themselves.

---

## 16. Stream cannot be cancelled

**Symptom**

Long generation in progress, user wants to stop. No way to cancel —
they have to wait for the model to finish.

**Fix**

`streamChatResponse` accepts an `AbortSignal` and forwards it to
`streamText({ abortSignal })`. `ChatScreen` keeps an `abortRef` and
exposes `stopStreaming` to `ChatInputBar`, which swaps the send icon
for a stop icon while `isStreaming`. On abort the partial assistant
message is finalized as `'Stopped.'` instead of an error, and the
auto-title routine is skipped.

---

## How to add a new provider

1. **Try it as-is** with `createOpenAICompatible` and your `baseURL` /
   `apiKey`. Most OpenAI-compatible endpoints just work.
2. **If it returns empty body or a malformed response**, check whether
   it needs a non-standard request field (search the provider's docs
   for `tool_stream`, `chat_template_kwargs`, etc.).
3. **Add a `ProviderQuirk`** to `src/services/ai/providerQuirks.ts`
   with a `matches(baseURL)` predicate and a `transformRequestBody`
   mutator. Don't branch inside `AIService` — keep that file
   provider-agnostic.
4. **Document it** here so the next person doesn't repeat the
   investigation.
