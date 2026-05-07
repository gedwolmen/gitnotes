import { generateText, streamText } from 'ai';
import type { LanguageModel as LanguageModelV1, ModelMessage, Tool } from 'ai';
import { Platform } from 'react-native';
import type { AIModelConfig, AIProviderConfig } from '../models/AIProvider';
import { chatTools } from './ai/tools';
import { buildQuirkedFetch } from './ai/providerQuirks';

type OnDeviceAvailability = {
  apple: boolean;
  llama: boolean;
};

type ModelStatus = 'ready' | 'needs-download' | 'unavailable';

type OpenAICompatibleProvider = {
  chatModel: (modelId: string) => LanguageModelV1;
};

type LlamaDownloadProgress = {
  percentage?: number;
};

type LlamaLanguageModel = LanguageModelV1 & {
  prepare: () => Promise<void>;
  download: (onProgress?: (progress: LlamaDownloadProgress) => void) => Promise<unknown>;
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

        const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
        const quirkedFetch = buildQuirkedFetch(providerConfig.baseURL);

        return createOpenAICompatible({
          name: providerConfig.id,
          baseURL: providerConfig.baseURL,
          apiKey: providerConfig.apiKey,
          ...(quirkedFetch ? { fetch: quirkedFetch as any } : {}),
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
): Promise<LanguageModelV1> {
  try {
    switch (modelConfig.providerType) {
      case 'apple': {
        if (Platform.OS !== 'ios') {
          throw new Error('Apple Intelligence is only available on iOS');
        }

        const { createAppleProvider } = await import('@react-native-ai/apple');
        const provider = createAppleProvider({ availableTools: chatTools });

        return provider() as LanguageModelV1;
      }
      case 'llama': {
        const provider = await buildProviderInstance({
          id: modelConfig.providerId,
          type: 'llama',
          name: 'Llama',
          isEnabled: true,
          models: [modelConfig],
          addedAt: 0,
        });

        const model = (provider as typeof import('@react-native-ai/llama').llama)
          .languageModel(modelConfig.id) as LlamaLanguageModel;
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
    const message = error instanceof Error ? error.message : 'Unknown model initialization error';
    throw new Error(`Failed to initialize model \"${modelConfig.name}\": ${message}`);
  }
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

  switch (event.type) {
    case 'tool-call':
      return JSON.stringify({
        type: 'tool-call',
        toolCallId,
        toolName: event.toolName,
        input: event.input ?? event.args,
      });
    case 'tool-input-start':
    case 'tool-call-streaming-start':
      return JSON.stringify({
        type: 'tool-call-streaming-start',
        toolCallId,
        toolName: event.toolName,
      });
    case 'tool-input-delta':
    case 'tool-call-delta':
      return JSON.stringify({
        type: 'tool-call-delta',
        toolCallId,
        toolName: event.toolName,
        argsTextDelta: event.delta ?? event.argsTextDelta ?? '',
      });
    case 'tool-result':
      return JSON.stringify({
        type: 'tool-result',
        toolCallId,
        toolName: event.toolName,
        result: event.output ?? event.result,
      });
    default:
      return null;
  }
}

function isEmptyResponseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; message?: string; cause?: { name?: string } };
  if (e.name === 'AI_EmptyResponseBodyError') return true;
  if (e.cause?.name === 'AI_EmptyResponseBodyError') return true;
  return /empty response body/i.test(e.message ?? '');
}

function humanizeStreamError(error: unknown): string {
  if (isEmptyResponseError(error)) {
    return 'The AI provider returned an empty response. This is often caused by high load on the provider, an invalid model name, or a tools-incompatible request. Please try again, or pick a different model.';
  }
  const message = error instanceof Error ? error.message : 'Unknown streaming error';
  return `Failed to stream chat response: ${message}`;
}

export async function* streamChatResponse(
  model: LanguageModelV1,
  messages: ModelMessage[],
  tools?: Record<string, Tool>,
  abortSignal?: AbortSignal,
): AsyncGenerator<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let yielded = false;
    try {
      const result = streamText({
        model,
        messages,
        tools,
        abortSignal,
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
          const err = part.error;
          const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Stream error';
          throw new Error(message);
        }

        const toolEvent = serializeToolEvent(part);
        if (toolEvent) {
          yielded = true;
          yield toolEvent;
        }
      }
      return;
    } catch (error) {
      // Retry once for transient empty-body responses, but only when no
      // partial output has been emitted yet (otherwise we'd duplicate content).
      if (!yielded && attempt === 0 && isEmptyResponseError(error)) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw new Error(humanizeStreamError(error));
    }
  }
}

export const sendMessage = streamChatResponse;

export async function generateChatTitle(
  model: LanguageModelV1,
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
  } catch {
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

    const { llama } = await import('@react-native-ai/llama');
    const model = llama.languageModel(modelConfig.id) as LlamaLanguageModel;

    await model.download((progress: LlamaDownloadProgress) => {
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
      return Platform.OS === 'ios' ? 'ready' : 'unavailable';
    }

    if (modelConfig.providerType === 'llama') {
      const { LlamaEngine } = await import('@react-native-ai/llama');
      return (await LlamaEngine.isDownloaded(modelConfig.id)) ? 'ready' : 'needs-download';
    }

    return 'ready';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown model status error';
    throw new Error(`Failed to get status for model \"${modelConfig.name}\": ${message}`);
  }
}
