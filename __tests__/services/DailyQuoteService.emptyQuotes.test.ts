jest.mock('../../src/data/philosopher_quotes.json', () => []);

const mockAIStoreState = {
  dailyQuoteEnabled: true,
  dailyQuotePersonalizationEnabled: false,
  aiPersonalizationEnabled: false,
  selectedModelId: null as string | null,
};

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: Object.assign(jest.fn(), {
    getState: () => ({
      dailyQuoteEnabled: mockAIStoreState.dailyQuoteEnabled,
      dailyQuotePersonalizationEnabled: mockAIStoreState.dailyQuotePersonalizationEnabled,
      aiPersonalizationEnabled: mockAIStoreState.aiPersonalizationEnabled,
      getSelectedModel: () => undefined,
    }),
  }),
}));

jest.mock('../../src/services/AIService', () => ({
  initializeModel: jest.fn(),
}));

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('../../src/stores/proStore', () => ({
  useProStore: { getState: () => ({}) },
  selectIsPro: () => true,
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { dailyQuoteService } from '../../src/services/DailyQuoteService';

describe('DailyQuoteService with empty quotes dataset', () => {
  beforeEach(async () => {
    await AsyncStorage.clear?.();
  });

  it('returns null instead of crashing when quotes array is empty', async () => {
    const result = await dailyQuoteService.getDailyQuote([], []);
    expect(result).toBeNull();
  });
});
