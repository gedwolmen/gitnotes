/**
 * Single source of truth for Anthropic-specific defaults.
 * When Anthropic ships a new model or deprecates an old one, update this file only.
 */

import type { AIProviderType } from '../../models/AIProvider';

export const ANTHROPIC_DEFAULT_MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-haiku-3-5-20241022', name: 'Claude Haiku 3.5' },
] as const;

export const ANTHROPIC_DEFAULT_PROVIDER_ID = 'anthropic-default';

export function isAnthropicBaseURL(value: string): boolean {
  if (!value) return false;
  return /api\.anthropic\.com/i.test(value) || /anthropic/i.test(value);
}

export function isAnthropicProviderType(type: AIProviderType): boolean {
  return type === 'anthropic';
}
