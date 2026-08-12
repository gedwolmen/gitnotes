import type { AIModelConfig } from '../../models/AIProvider';
import { BYTES_PER_TOKEN } from './config';
import { getFactory } from './providerFactory';

export interface ModelContextLimit {
  totalTokens: number;
  reservedTokens: number;
  label: string;
}

const SMOLLM_LIMIT: ModelContextLimit = {
  totalTokens: 65536,
  reservedTokens: 4000,
  label: 'SmolLM3 (64K)',
};

export function getModelContextLimit(model: AIModelConfig): ModelContextLimit | null {
  if (model.providerType === 'llama') {
    if (/smol/i.test(model.id) || /smol/i.test(model.name)) {
      return SMOLLM_LIMIT;
    }
  }

  const factory = getFactory(model.providerType);
  return factory.contextLimit || null;
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
