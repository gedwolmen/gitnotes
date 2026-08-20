jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('../../src/services/AIService', () => ({
  initializeModel: jest.fn(),
}));

jest.mock('../../src/stores/aiStore', () => {
  let state: Record<string, unknown> = {
    dailyQuoteEnabled: true,
    aiPersonalizationEnabled: true,
    selectedModelId: null,
    getSelectedModel: jest.fn(() => undefined),
  };
  return {
    useAIStore: Object.assign(jest.fn(), {
      getState: () => state,
      __setMockState: (next: Record<string, unknown>) => {
        state = { ...state, ...next };
      },
      __reset: () => {
        state = {
          dailyQuoteEnabled: true,
          aiPersonalizationEnabled: true,
          selectedModelId: null,
          getSelectedModel: jest.fn(() => undefined),
        };
      },
    }),
  };
});

import { dailyQuoteService } from '../../src/services/DailyQuoteService';
import { useAIStore } from '../../src/stores/aiStore';
import { __setProState } from '../../src/stores/proStore';

type AIStoreMock = typeof useAIStore & {
  __setMockState: (next: Record<string, unknown>) => void;
  __reset: () => void;
};

const aiStoreMock = useAIStore as AIStoreMock;

function setFree(): void {
  __setProState({ status: 'free', entitlementActive: false, isGrandfathered: false });
}

function setPro(): void {
  __setProState({ status: 'pro', entitlementActive: true, isGrandfathered: false });
}

beforeEach(async () => {
  jest.clearAllMocks();
  aiStoreMock.__reset();
  setPro();
  await dailyQuoteService.clearCache();
});

describe('DailyQuoteService Pro-aware fallback', () => {
  it('non-Pro user with no model gets a neutral fallback (no Settings instruction)', async () => {
    setFree();
    const quote = await dailyQuoteService.getDailyQuote([], []);
    expect(quote).not.toBeNull();
    expect(quote!.description).not.toMatch(/Choose a model/);
    expect(quote!.description).not.toMatch(/Settings/);
    expect(quote!.description).toMatch(/GitNotēs Pro|collection/i);
  });

  it('Pro user with no model keeps the original "Choose a model" copy', async () => {
    setPro();
    const quote = await dailyQuoteService.getDailyQuote([], []);
    expect(quote).not.toBeNull();
    expect(quote!.description).toMatch(/Choose a model/);
  });

  it('non-Pro user with the Daily Quote disabled gets the neutral Pro message', async () => {
    setFree();
    aiStoreMock.__setMockState({ dailyQuoteEnabled: false });
    const quote = await dailyQuoteService.getDailyQuote([], []);
    expect(quote).not.toBeNull();
    expect(quote!.description).not.toMatch(/Settings/);
    expect(quote!.description).toMatch(/GitNotēs Pro/);
  });

  it('Pro user with the Daily Quote disabled keeps the original copy', async () => {
    setPro();
    aiStoreMock.__setMockState({ dailyQuoteEnabled: false });
    const quote = await dailyQuoteService.getDailyQuote([], []);
    expect(quote).not.toBeNull();
    expect(quote!.description).toMatch(/Daily Quote feature is disabled/);
  });

  it('non-Pro user with personalization off gets the neutral Pro message', async () => {
    setFree();
    aiStoreMock.__setMockState({ aiPersonalizationEnabled: false });
    const quote = await dailyQuoteService.getDailyQuote([], []);
    expect(quote).not.toBeNull();
    expect(quote!.description).not.toMatch(/data safety/);
    expect(quote!.description).toMatch(/GitNotēs Pro/);
  });

  it('Pro user with personalization off keeps the original copy', async () => {
    setPro();
    aiStoreMock.__setMockState({ aiPersonalizationEnabled: false });
    const quote = await dailyQuoteService.getDailyQuote([], []);
    expect(quote).not.toBeNull();
    expect(quote!.description).toMatch(/data safety/);
  });

  it('always returns a real quote payload with the fallback', async () => {
    setFree();
    const quote = await dailyQuoteService.getDailyQuote([], []);
    expect(quote).not.toBeNull();
    expect(typeof quote!.quoteId).toBe('string');
    expect(typeof quote!.text).toBe('string');
    expect(typeof quote!.author).toBe('string');
    expect(Array.isArray(quote!.tags)).toBe(true);
  });
});
