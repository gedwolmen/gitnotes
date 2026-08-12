/**
 * VisionCapabilityChecker — determines whether a given AI model + provider
 * combination supports vision (image-in / text-out) for canvas atlas transcriptions.
 *
 * Pure service, no side effects. Rules derived from provider capabilities:
 *   - 'openai-compatible': vision if model ID contains 'vision' or model explicitly declares supportsVision
 *   - 'anthropic': vision for all claude-3+ models (Sonnet, Haiku, Opus)
 *   - 'apple': partial vision support on iOS 18.1+ Foundation Model (text descriptions of images)
 *   - 'llama': NO vision (single-modal text only via llama.rn)
 */

import type { AIModelConfig, AIProviderConfig } from '../../models/AIProvider';

/** Vision support result: why a model can/cannot handle vision input */
export interface VisionCheckResult {
  supported: boolean;
  /**
   * 'always' = this model+provider unconditionally supports vision
   * 'when-declared' = requires model.supportsVision = true in config
   * 'never' = provider architecture cannot do vision (e.g., on-device llama.rn)
   */
  supportKind: 'always' | 'when-declared' | 'never';
  /** Human-readable reason (for UI / error messages) */
  reason: string;
}

export class VisionCapabilityChecker {
  /**
   * Check vision support for a model given its provider config.
   */
  check(model: AIModelConfig, provider: AIProviderConfig): VisionCheckResult {
    switch (provider.type) {
      case 'llama':
        return {
          supported: false,
          supportKind: 'never',
          reason:
            'On-device llama.rn models do not support vision input. Switch to an OpenAI-compatible or Anthropic provider.',
        };

      case 'anthropic':
        // Claude 3+ models (Sonnet, Haiku, Opus) all support vision
        return {
          supported: true,
          supportKind: 'always',
          reason: `Anthropic provider with "${model.name}" supports vision.`,
        };

      case 'openai-compatible':
        // Vision available if model explicitly declares it, or ID contains 'vision'/image keywords
        if (model.supportsVision === true) {
          return {
            supported: true,
            supportKind: 'always',
            reason: `"${model.name}" declares vision support.`,
          };
        }
        if (this.isOpenaiCompatibleVisionId(model.id)) {
          return {
            supported: true,
            supportKind: 'when-declared',
            reason: `"${model.id}" matches a known vision model pattern.`,
          };
        }
        return {
          supported: false,
          supportKind: 'when-declared',
          reason: `"${model.name}" does not declare vision support. Enable "supportsVision" in model config if the provider supports it.`,
        };

      case 'apple':
        // Apple Intelligence on iOS 18.1+ Foundation Model has limited vision (image descriptions)
        if (model.id === 'apple-foundation') {
          return {
            supported: true,
            supportKind: 'when-declared',
            reason:
              'Apple Intelligence Foundation Model supports vision on iOS 18.1+ / macOS Sequoia 15.1+.',
          };
        }
        return {
          supported: false,
          supportKind: 'never',
          reason: `Apple model "${model.name}" does not support vision.`,
        };

      default: {
        // Exhaustive check — compiler error if a new provider type is added without handling
        const _exhaustive: never = provider.type;
        return {
          supported: false,
          supportKind: 'never',
          reason: `Unknown provider type: ${_exhaustive}`,
        };
      }
    }
  }

  /**
   * Find the best vision-capable model from the user's providers list.
   *
   * Priority:
   * 1. Selected model (if it supports vision)
   * 2. Any Anthropic model
   * 3. Any openai-compatible model that declares vision
   * 4. null if none found
   */
  findVisionModel(
    providers: AIProviderConfig[],
    selectedModelId: string | null,
  ): { model: AIModelConfig; provider: AIProviderConfig } | null {
    // Flatten all models with their provider
    const allModels: Array<{ model: AIModelConfig; provider: AIProviderConfig }> = [];
    for (const provider of providers) {
      if (!provider.isEnabled) continue;
      for (const model of provider.models) {
        allModels.push({ model, provider });
      }
    }

    // Check selected model first
    if (selectedModelId) {
      const selected = allModels.find((m) => m.model.id === selectedModelId);
      if (selected && this.check(selected.model, selected.provider).supported) {
        return selected;
      }
    }

    // Prefer Anthropic (always works)
    const anthropicModel = allModels.find(
      (m) => m.provider.type === 'anthropic',
    );
    if (anthropicModel) {
      return anthropicModel;
    }

    // Fall back to any openai-compatible with explicit vision support
    const openaiVisionModel = allModels.find(
      (m) =>
        m.provider.type === 'openai-compatible' &&
        m.model.supportsVision === true,
    );
    if (openaiVisionModel) {
      return openaiVisionModel;
    }

    return null;
  }

  /**
   * Heuristic: OpenAI-compatible vision model IDs typically contain
   * 'vision', '-vl' (for Qwen VL), or 'image' keywords.
   */
  private isOpenaiCompatibleVisionId(modelId: string): boolean {
    const id = modelId.toLowerCase();
    return (
      id.includes('vision') ||
      id.includes('-vl') ||
      id.includes('image') ||
      id.includes('gpt-4o') ||
      id.includes('gpt-4-turbo') ||
      // Qwen VL variants
      id.includes('qwen-vl') ||
      id.includes('qwenvl')
    );
  }
}
