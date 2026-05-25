import { generateText, streamText } from 'ai';
import type { LanguageModel, ModelMessage, Tool } from 'ai';
import { Platform } from 'react-native';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AIModelConfig, AIProviderConfig } from '../models/AIProvider';
import { chatTools } from './ai/tools';
import { buildQuirkedFetch } from './ai/providerQuirks';
import {
  ProviderUnavailableError,
  resolveProviderAvailability,
} from './ai/providerAvailability';
import {
  extractErrorDetails,
  humanizeStreamError,
} from './ai/aiServiceErrors';

type OnDeviceAvailability = {
  apple: boolean;
  llama: boolean;
};

type ModelStatus = 'ready' | 'needs-download' | 'unavailable';

type OpenAICompatibleProvider = {
  chatModel: (modelId: string) => LanguageModel;
};

type LlamaDownloadProgress = {
  percentage?: number;
};

const DEFAULT_ON_DEVICE_MODELS: AIModelConfig[] = [
  {
    id: 'apple-foundation',
    name: 'Foundation Model',
    providerId: 'apple-default',
    providerType: 'apple',
    requiresDownload: false,
  },
  {
    id: 'llama-smol',
    name: 'SmolLM3 3B',
    providerId: 'llama-default',
    providerType: 'llama',
    requiresDownload: true,
    downloadSize: '~2GB',
    isDownloaded: false,
  },
];

async function buildProviderInstance(providerConfig: AIProviderConfig): Promise<unknown> {
  try {
    switch (providerConfig.type) {
      case 'apple': {
        const { apple } = await import('@react-native-ai/apple');
        return apple;
      }
      case 'llama': {
        const { llama } = await import('@react-native-ai/llama');
        return llama;
      }
      case 'openai-compatible': {
        if (!providerConfig.baseURL) {
          throw new Error(`Provider \"${providerConfig.name}\" is missing a base URL`);
        }

        if (!providerConfig.apiKey) {
          throw new Error(`Provider \"${providerConfig.name}\" is missing an API key`);
        }

        // Static import (not `await import(...)`). Expo's `async-require`
        // path went through the web HMR helper on iPad and threw
        // `Cannot read property 'reload' of undefined` (it tried
        // `window.location.reload`), surfacing in the chat panel as
        // "Failed to build provider 'Openrouter'". A static import bypasses
        // the dynamic loader and ships @ai-sdk/openai-compatible directly
        // in the main bundle.
        const quirkedFetch = buildQuirkedFetch(providerConfig.baseURL);

        return createOpenAICompatible({
          name: providerConfig.id,
          baseURL: providerConfig.baseURL,
          apiKey: providerConfig.apiKey,
          ...(quirkedFetch ? { fetch: quirkedFetch } : {}),
        });
      }
      default:
        throw new Error(`Unsupported AI provider type: ${(providerConfig as AIProviderConfig).type}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider initialization error';
    throw new Error(`Failed to build provider \"${providerConfig.name}\": ${message}`);
  }
}

export async function initializeModel(
  modelConfig: AIModelConfig,
  providerConfig?: AIProviderConfig
): Promise<LanguageModel> {
  try {
    switch (modelConfig.providerType) {
      case 'apple': {
        if (Platform.OS !== 'ios') {
          throw new Error('Apple Intelligence is only available on iOS');
        }

        // Probe device eligibility before touching the bridge so the call
        // doesn't hang silently on devices like iPhone 14 Pro that are
        // permanently ineligible for Apple Intelligence (A16 Bionic).
        const probeProvider: AIProviderConfig = providerConfig ?? {
          id: modelConfig.providerId,
          type: 'apple',
          name: 'Apple Intelligence',
          isEnabled: true,
          models: [modelConfig],
          addedAt: 0,
          supportedPlatforms: ['ios'],
        };
        const availability = await resolveProviderAvailability(probeProvider);
        if (availability.kind === 'unavailable') {
          throw new ProviderUnavailableError(availability.reason, probeProvider.name);
        }

        const { createAppleProvider } = await import('@react-native-ai/apple');
        const provider = createAppleProvider({ availableTools: chatTools as any });

        return provider() as LanguageModel;
      }
      case 'llama': {
        const { getModelPath } = await import('@react-native-ai/llama');
        const modelPath = getModelPath(modelConfig.id);
        const provider = await buildProviderInstance({
          id: modelConfig.providerId,
          type: 'llama',
          name: 'Llama',
          isEnabled: true,
          models: [modelConfig],
          addedAt: 0,
        });

        const model = (provider as typeof import('@react-native-ai/llama').llama)
          .languageModel(modelPath);
        await model.prepare();
        return model;
      }
      case 'openai-compatible': {
        if (!providerConfig) {
          throw new Error(
            `OpenAI-compatible model \"${modelConfig.name}\" requires provider configuration`
          );
        }

        const provider = await buildProviderInstance(providerConfig);
        return (provider as OpenAICompatibleProvider).chatModel(modelConfig.id);
      }
      default:
        throw new Error(`Unsupported AI model type: ${(modelConfig as AIModelConfig).providerType}`);
    }
  } catch (error) {
    // Preserve typed eligibility errors so the UI can surface the specific reason
    // (otherwise the bridge call would just hang on ineligible iPhones like the 14 Pro).
    if (error instanceof ProviderUnavailableError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Unknown model initialization error';
    throw new Error(`Failed to initialize model \"${modelConfig.name}\": ${message}`);
  }
}

// Some OpenRouter-routed models (e.g. Ring-2.6-1T) emit tool calls in a
// text-like form `name: {jsonargs}` that the SDK can't fully split, so the
// whole line lands in `toolName`. Normalise once at the serialise boundary
// so every downstream consumer (actionExecutor, ChatMessageBubble) sees a
// clean toolName plus merged args. (#747)
function normalizeToolName(raw: string): { name: string; embeddedArgs?: Record<string, unknown> } {
  const colonIdx = raw.indexOf(':');
  if (colonIdx < 0) return { name: raw };
  const name = raw.slice(0, colonIdx).trim();
  const tail = raw.slice(colonIdx + 1).trim();
  if (!tail.startsWith('{')) return { name: raw };
  try {
    const parsed = JSON.parse(tail);
    return { name, embeddedArgs: typeof parsed === 'object' && parsed ? parsed : undefined };
  } catch {
    return { name: raw };
  }
}

function isEmptyInput(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function serializeToolEvent(part: unknown): string | null {
  if (!part || typeof part !== 'object' || !("type" in part)) {
    return null;
  }

  const event = part as {
    type: string;
    id?: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    args?: unknown;
    delta?: string;
    argsTextDelta?: string;
    result?: unknown;
    output?: unknown;
  };

  const toolCallId = event.toolCallId ?? event.id;
  const rawName = event.toolName ?? '';
  const { name: toolName, embeddedArgs } = normalizeToolName(rawName);

  switch (event.type) {
    case 'tool-call': {
      const rawInput = event.input ?? event.args;
      const input = embeddedArgs && isEmptyInput(rawInput) ? embeddedArgs : rawInput;
      return JSON.stringify({
        type: 'tool-call',
        toolCallId,
        toolName,
        input,
      });
    }
    case 'tool-input-start':
    case 'tool-call-streaming-start':
      return JSON.stringify({
        type: 'tool-call-streaming-start',
        toolCallId,
        toolName,
      });
    case 'tool-input-delta':
    case 'tool-call-delta':
      return JSON.stringify({
        type: 'tool-call-delta',
        toolCallId,
        toolName,
        argsTextDelta: event.delta ?? event.argsTextDelta ?? '',
      });
    case 'tool-result':
      return JSON.stringify({
        type: 'tool-result',
        toolCallId,
        toolName,
        result: event.output ?? event.result,
      });
    default:
      return null;
  }
}

// The AI SDK warns when a `role: 'system'` entry is included in `messages`
// because in some providers it can be overridden by user-supplied prompt
// injection. Lift system entries into the top-level `system` option instead.
function splitSystemMessages(messages: ModelMessage[]): {
  system: string | undefined;
  rest: ModelMessage[];
} {
  const systemTexts: string[] = [];
  const rest: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === 'system') {
      const content = message.content;
      if (typeof content === 'string') {
        systemTexts.push(content);
      }
      continue;
    }
    rest.push(message);
  }
  return {
    system: systemTexts.length > 0 ? systemTexts.join('\n\n') : undefined,
    rest,
  };
}

async function* runGenerateTextFallback(
  model: LanguageModel,
  messages: ModelMessage[],
  tools: Record<string, Tool> | undefined,
  abortSignal: AbortSignal | undefined,
): AsyncGenerator<string> {
  const { system, rest } = splitSystemMessages(messages);
  // `generateText` has no `onError` hook (unlike `streamText`), so the
  // SDK's parser-error path logs via `console.error` before re-throwing
  // — surfaces as a RedBox even though we recover (#705).
  const originalConsoleError = console.error;
  console.error = () => {};
  const result = await generateText({ model, system, messages: rest, tools, abortSignal })
    .finally(() => {
      console.error = originalConsoleError;
    });
  if (typeof result.text === 'string' && result.text.length > 0) {
    yield result.text;
  }
  const toolCalls = (result as { toolCalls?: unknown[] }).toolCalls;
  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      const event = serializeToolEvent({ ...(call as object), type: 'tool-call' });
      if (event) yield event;
    }
  }
}

export async function* streamChatResponse(
  model: LanguageModel,
  messages: ModelMessage[],
  tools?: Record<string, Tool>,
  abortSignal?: AbortSignal,
): AsyncGenerator<string> {
  let yielded = false;
  let lastEmptyBodyError: unknown = null;
  const { system, rest } = splitSystemMessages(messages);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // The default `onError` in `streamText` calls `console.error(error)`,
      // which surfaces as a RedBox / LogBox toast in dev even when we
      // recover via the generateText fallback below. Swallow it here so
      // the only error the user sees is the humanised one we throw
      // ourselves; the stream error still propagates via `part.type ===
      // 'error'` so our recovery logic is unaffected.
      const result = streamText({
        model,
        system,
        messages: rest,
        tools,
        abortSignal,
        onError: () => {},
      });

      for await (const part of result.fullStream as AsyncIterable<any>) {
        if (part.type === 'text-delta' || part.type === 'text') {
          const delta = typeof part.text === 'string' ? part.text : part.textDelta;
          if (typeof delta === 'string' && delta.length > 0) {
            yielded = true;
            yield delta;
          }
          continue;
        }

        if (part.type === 'error') {
          // Preserve the original error shape (e.g. AI_APICallError with
          // statusCode) so the outer catch's extractErrorDetails can
          // recognise parser failures and route to the generateText
          // fallback. Wrapping in `new Error(message)` previously stripped
          // the error name, so the parser-error branch never fired for
          // stream-emitted errors (#691).
          const err = part.error;
          if (err instanceof Error) throw err;
          if (typeof err === 'string') throw new Error(err);
          throw new Error('Stream error');
        }

        const toolEvent = serializeToolEvent(part);
        if (toolEvent) {
          yielded = true;
          yield toolEvent;
        }
      }
      return;
    } catch (error) {
      const details = extractErrorDetails(error);

      if (!yielded && attempt === 0 && details.isEmptyBody) {
        lastEmptyBodyError = error;
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      if (!yielded && (details.isParserError || details.isEmptyBody)) {
        try {
          for await (const chunk of runGenerateTextFallback(model, messages, tools, abortSignal)) {
            yielded = true;
            yield chunk;
          }
          return;
        } catch {
          throw new Error(humanizeStreamError(error));
        }
      }

      throw new Error(humanizeStreamError(error));
    }
  }

  if (!yielded && lastEmptyBodyError) {
    throw new Error(humanizeStreamError(lastEmptyBodyError));
  }
}

export const sendMessage = streamChatResponse;

export async function generateChatTitle(
  model: LanguageModel,
  userText: string,
  assistantText: string,
): Promise<string | null> {
  try {
    const trimmedAssistant = assistantText.trim().slice(0, 400);
    const trimmedUser = userText.trim().slice(0, 200);
    const result = await generateText({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Generate a short, descriptive chat title (2-5 words) summarizing the conversation. Reply with only the title, no quotes, no punctuation at the end.',
        },
        {
          role: 'user',
          content: `User: ${trimmedUser}\nAssistant: ${trimmedAssistant}`,
        },
      ],
    });

    const raw = (result.text || '').trim().replace(/^["'`]|["'`]$/g, '').replace(/\.$/, '');
    if (!raw) return null;
    const words = raw.split(/\s+/).slice(0, 6).join(' ');
    return words.length > 60 ? words.slice(0, 60) : words;
  } catch (error) { void error;
    return null;
  }
}

export async function getAvailableOnDeviceModels(): Promise<AIModelConfig[]> {
  try {
    const availability = await isOnDeviceAvailable();

    return DEFAULT_ON_DEVICE_MODELS.filter((model) => {
      if (model.providerType === 'apple') {
        return availability.apple;
      }

      if (model.providerType === 'llama') {
        return availability.llama;
      }

      return false;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown availability error';
    throw new Error(`Failed to list on-device models: ${message}`);
  }
}

export async function isOnDeviceAvailable(): Promise<OnDeviceAvailability> {
  try {
    return {
      apple: Platform.OS === 'ios',
      llama: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown availability error';
    throw new Error(`Failed to check on-device AI availability: ${message}`);
  }
}

export async function downloadModel(
  modelConfig: AIModelConfig,
  onProgress: (pct: number) => void
): Promise<void> {
  try {
    if (modelConfig.providerType !== 'llama') {
      return;
    }

    const { downloadModel: llamaDownloadModel } = await import('@react-native-ai/llama');
    await llamaDownloadModel(modelConfig.id, (progress) => {
      onProgress(progress.percentage ?? 0);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown download error';
    throw new Error(`Failed to download model \"${modelConfig.name}\": ${message}`);
  }
}

export async function getModelStatus(modelConfig: AIModelConfig): Promise<ModelStatus> {
  try {
    if (modelConfig.providerType === 'apple') {
      const probeProvider: AIProviderConfig = {
        id: modelConfig.providerId,
        type: 'apple',
        name: 'Apple Intelligence',
        isEnabled: true,
        models: [modelConfig],
        addedAt: 0,
        supportedPlatforms: ['ios'],
      };
      const availability = await resolveProviderAvailability(probeProvider);
      return availability.kind === 'available' ? 'ready' : 'unavailable';
    }

    if (modelConfig.providerType === 'llama') {
      const { isModelDownloaded } = await import('@react-native-ai/llama');
      return (await isModelDownloaded(modelConfig.id)) ? 'ready' : 'needs-download';
    }

    return 'ready';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown model status error';
    throw new Error(`Failed to get status for model \"${modelConfig.name}\": ${message}`);
  }
}
