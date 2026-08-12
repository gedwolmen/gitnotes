# AI Providers

> How GitNotēs connects to AI providers and how to add a new one.

## Overview

GitNotēs supports 4 AI provider types, each backed by a different SDK:

| Provider | Type String | SDK | Auth |
|----------|-------------|-----|------|
| Apple Intelligence | `apple` | `@react-native-ai/apple` | Device-level (no API key) |
| On-device Llama | `llama` | `@react-native-ai/llama` + `llama.rn` | Device-level (model download) |
| OpenAI-compatible | `openai-compatible` | `@ai-sdk/openai-compatible` | `Authorization: Bearer <apiKey>` |
| Anthropic | `anthropic` | `@ai-sdk/anthropic` | `x-api-key: <apiKey>` |

## Key Files

| File | Role |
|------|------|
| `src/models/AIProvider.ts` | Type definitions (`AIProviderType`, `AIProviderConfig`, `AIModelConfig`) |
| `src/services/AIService.ts` | Provider instantiation (`buildProviderInstance`, `initializeModel`) |
| `src/services/ai/providerFactory.ts` | Provider registry and factory pattern |
| `src/services/ai/providerAvailability.ts` | Runtime availability checks |
| `src/services/ai/modelLimits.ts` | Context window limits per provider |
| `src/services/ai/providerQuirks.ts` | Provider-specific workarounds |
| `src/services/ai/anthropicDefaults.ts` | Anthropic-specific constants and default models |
| `src/services/ai/modelDiscoveryService.ts` | Lazy model discovery with caching |
| `src/components/ai/ProviderConfigModal.tsx` | UI for configuring providers |
| `src/stores/aiStore.ts` | Default providers and state management |

## Auto-Discovery of Models (Anthropic)

Anthropic providers automatically discover available models via the API when a user adds or updates their API key. This enables users to access new model releases without manual configuration.

### How it works

1. User enters Anthropic API key in Settings → AI → Anthropic
2. `aiStore.updateProvider` detects the API key change
3. Calls `discoverModelsIfNeeded(provider)` asynchronously
4. Fetches available models from `/v1/models` endpoint
5. Caches results in AsyncStorage for 24 hours
6. Updates provider.models with discovered models
7. Persists to settings

### Caching

- **Cache key**: `anthropic-models-cache-{providerId}`
- **Cache TTL**: 24 hours
- **SDK version tracking**: Cache invalidates on `@ai-sdk/anthropic` version changes
- **Fallback**: If discovery fails, uses `ANTHROPIC_DEFAULT_MODELS` from `anthropicDefaults.ts`

### Manual Refresh

Users can manually refresh the model list via `aiStore.refreshProviderModels(providerId)`. Useful for:
- Detecting newly released models
- Clearing stale cache
- Debugging model availability

### Implementation

See `src/services/ai/modelDiscoveryService.ts` for the full implementation. Key functions:
- `discoverModelsIfNeeded(provider)`: Main entry point, handles caching and fallback
- `clearCachedModels(providerId)`: Remove cache for specific provider
- `clearAllCachedModels()`: Remove all Anthropic model caches

## Provider Construction Flow

1. User adds/configures a provider via `ProviderConfigModal`
2. Provider is saved to `aiStore` (persisted via SecureStore for API keys)
3. When user selects a model, `initializeModel(model, provider)` is called in `AIService.ts`
4. `buildProviderInstance(provider)` creates the SDK instance
5. `provider.chatModel(modelId)` returns the language model

## How to Add a New Provider

### Step 1: Add to the type union

In `src/models/AIProvider.ts`:

```typescript
export type AIProviderType = 'apple' | 'llama' | 'openai-compatible' | 'anthropic' | 'new-provider';
```

### Step 2: Wire buildProviderInstance

In `src/services/AIService.ts`, add a `case 'new-provider':` that imports the SDK and creates an instance.

### Step 3: Wire initializeModel

Add a matching `case 'new-provider':` in `initializeModel`.

### Step 4: Add context limits

In `src/services/ai/modelLimits.ts`, add a limit constant for the new provider's models.

### Step 5: Update settings UI

In `src/screens/SettingsScreen.tsx`, add the new type to the `onProviderPress` condition.

### Step 6: Add default provider

In `src/stores/aiStore.ts`, add the provider to `createDefaultProviders()`.

### Step 7: Write tests

Create `__tests__/newProvider.test.ts` covering initialization, context limits, and availability.

## Cross-links

- [AI Integration](./ai-integration.md) — detailed AI service documentation
- [Architecture](./architecture.md) — overall system design
- [Testing Guide](./testing-guide.md) — how providers are tested
