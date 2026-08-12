import type { AIModelConfig } from '../../models/AIProvider';
import { BYTES_PER_TOKEN } from './config';

export interface ModelContextLimit {
  totalTokens: number;
  /** Tokens reserved for system prompt + assistant output. */
  reservedTokens: number;
  /** Display label used in warnings. */
  label: string;
}

const APPLE_LIMIT: ModelContextLimit = {
  totalTokens: 4096,
  reservedTokens: 1500,
  label: 'Apple on-device (4K total)',
};

const LLAMA_DEFAULT_LIMIT: ModelContextLimit = {
  totalTokens: 8192,
  reservedTokens: 2000,
  label: 'on-device Llama (~8K)',
};

const SMOLLM_LIMIT: ModelContextLimit = {
  totalTokens: 65536,
  reservedTokens: 4000,
  label: 'SmolLM3 (64K)',
};

const CLAUDE_LIMIT: ModelContextLimit = {
  totalTokens: 200000,
  reservedTokens: 10000,
  label: 'Claude (200K total)',
};

export function getModelContextLimit(model: AIModelConfig): ModelContextLimit | null {
  if (model.providerType === 'apple') {
    return APPLE_LIMIT;
  }
  if (model.providerType === 'llama') {
    if (/smol/i.test(model.id) || /smol/i.test(model.name)) {
      return SMOLLM_LIMIT;
    }
    return LLAMA_DEFAULT_LIMIT;
  }
  if (model.providerType === 'anthropic') {
    return CLAUDE_LIMIT;
  }
  return null;
}

/** Rough token estimate from byte length. See `BYTES_PER_TOKEN`. */
export function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(bytes / BYTES_PER_TOKEN);
}

export interface ContextBudgetCheck {
  estimatedTokens: number;
  budgetTokens: number;
  overBudget: boolean;
  warningLevel: 'none' | 'caution' | 'over';
  message: string | null;
}

export function checkContextBudget(
  model: AIModelConfig | undefined,
  totalContextBytes: number,
): ContextBudgetCheck {
  const noWarn: ContextBudgetCheck = {
    estimatedTokens: estimateTokensFromBytes(totalContextBytes),
    budgetTokens: 0,
    overBudget: false,
    warningLevel: 'none',
    message: null,
  };

  if (!model) return noWarn;
  const limit = getModelContextLimit(model);
  if (!limit) return noWarn;

  const budget = limit.totalTokens - limit.reservedTokens;
  const estimated = estimateTokensFromBytes(totalContextBytes);
  if (estimated <= budget * 0.6) {
    return { estimatedTokens: estimated, budgetTokens: budget, overBudget: false, warningLevel: 'none', message: null };
  }
  if (estimated > budget) {
    return {
      estimatedTokens: estimated,
      budgetTokens: budget,
      overBudget: true,
      warningLevel: 'over',
      message: `Attached context (~${estimated.toLocaleString()} tokens) exceeds ${limit.label} budget (~${budget.toLocaleString()}). The model will likely fail or truncate. Remove or shrink files.`,
    };
  }
  return {
    estimatedTokens: estimated,
    budgetTokens: budget,
    overBudget: false,
    warningLevel: 'caution',
    message: `Attached context (~${estimated.toLocaleString()} tokens) is close to ${limit.label} budget (~${budget.toLocaleString()}). Response may be cut off.`,
  };
}
