# GitNotes AI

Chat interface for managing notes and todos via an LLM. Threads are persisted to a GitHub repository so the conversation survives across devices.

## Supported providers

| Provider          | Where it runs        | Context window | Notes                                                            |
| ----------------- | -------------------- | -------------- | ---------------------------------------------------------------- |
| Apple Foundation  | On-device (iOS only) | **4,096 tok**  | Hard limit; throws `.exceededContextWindowSize` over budget.     |
| Llama (SmolLM3-3B)| On-device            | 64K (up to 128K with YaRN) | Requires model download (~2 GB).                       |
| OpenAI-compatible | Hosted               | Provider-specific | Any `/chat/completions`-compatible endpoint, e.g. Z.AI, OpenAI. |

The token budget warning in the input bar uses the model-specific limits in [`src/services/ai/modelLimits.ts`](../src/services/ai/modelLimits.ts).

## Adding an OpenAI-compatible provider

Settings → AI → **Add Provider**. Required fields:

- **Base URL** — e.g. `https://api.openai.com/v1`, `https://api.z.ai/api/coding/paas/v4`, `http://localhost:11434/v1` (Ollama).
- **API key** — stored in Expo SecureStore (`expo-secure-store`).

After saving, **Test Connection** queries `/models` and offers to import discovered models.

### Z.AI Coding Plan

Use base URL `https://api.z.ai/api/coding/paas/v4`. Available models: `glm-5.1`, `glm-5-turbo`, `glm-4.7`, `glm-4.5-air`. The Z.AI quirk in [`providerQuirks.ts`](../src/services/ai/providerQuirks.ts) automatically injects `tool_stream: true` so streaming works with tools.

## Adding a provider quirk

Some providers diverge from the OpenAI schema (extra body fields, custom headers, etc.). Add a `ProviderQuirk` in `src/services/ai/providerQuirks.ts` — don't branch inside `AIService`.

```ts
{
  id: 'my-provider',
  matches: (url) => /myprovider\.com/.test(url),
  transformRequestBody: (body) => {
    body.custom_field = true;
  },
}
```

The first quirk whose `matches(baseURL)` returns true wins. Quirks only apply to `openai-compatible` providers.

## Chat storage

Threads are persisted as JSON files in a user-chosen GitHub repo and branch. Path layout:

```
gitnotes-chat/
├─ .gitkeep
├─ index.json             # { threads: [{id,title,updatedAt,...}] }
└─ <thread-id>.json       # full ChatThread with messages
```

PUT/DELETE requests retry on 409/422 (sha conflict) up to `GITHUB_WRITE_RETRIES` times — see [`config.ts`](../src/services/ai/config.ts). Thread saves run inside a `githubActivity.begin/end` envelope so the global `GitHubActivityIndicator` pill shows during sync.

## Tunables

All magic numbers live in [`src/services/ai/config.ts`](../src/services/ai/config.ts):

- `MAX_CONTEXT_FILE_BYTES` — per-file cap when packing context
- `MAX_CONTEXT_TOTAL_BYTES` — overall cap
- `GITHUB_WRITE_RETRIES` — retries on 409/422
- `BYTES_PER_TOKEN` — used for token-budget estimation
- `STREAM_RENDER_FLUSH_MS` — throttle for streaming text → bubble updates

## Attached contexts

Selecting a file/folder/repo in the context picker stamps an `AIContextItem` with `branch` and `approxBytes` onto the user message. On every assistant turn, **all unique contexts ever attached in the thread** are aggregated and packed into the system prompt — so a file attached on turn 1 stays visible to the model on turn 5.

## Editing & regenerating

- **Long-press a user message** → edit text and re-send. All replies after are discarded.
- **Long-press an assistant message** → regenerate. Drops the reply (and anything after) and re-streams from the prior user message.
- **Stop button** → tap the stop icon in the input bar while streaming to abort.

## Security notes

- GitHub OAuth token is stored in `expo-secure-store` (Keychain on iOS, EncryptedSharedPreferences on Android). Legacy AsyncStorage tokens migrate on first read.
- AI provider API keys are also in SecureStore.
- HTTP base URLs prompt a confirmation before save (key would travel in plain text).

## Known limits

- Apple Foundation Model returns `LanguageModelSession.GenerationError -1` in the iOS Simulator unless Apple Intelligence assets are provisioned. Test on a real device.
- Title generation makes a second model call per new chat. For paid providers, expect one extra request after the first turn.
