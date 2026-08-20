jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

const mockAIStoreState = {
  dailyQuoteEnabled: true,
  dailyQuotePersonalizationEnabled: true,
  aiPersonalizationEnabled: true,
  selectedModelId: 'test-model' as string | null,
};

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: Object.assign(jest.fn(), {
    getState: () => ({
      dailyQuoteEnabled: mockAIStoreState.dailyQuoteEnabled,
      dailyQuotePersonalizationEnabled: mockAIStoreState.dailyQuotePersonalizationEnabled,
      aiPersonalizationEnabled: mockAIStoreState.aiPersonalizationEnabled,
      getSelectedModel: () =>
        mockAIStoreState.selectedModelId
          ? {
              id: mockAIStoreState.selectedModelId,
              name: 'Test Model',
              providerId: 'test-provider',
              providerType: 'anthropic',
            }
          : undefined,
    }),
  }),
}));

jest.mock('../../src/services/AIService', () => ({
  initializeModel: jest.fn(async () => ({ id: 'test-model' })),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateText } from 'ai';
import { dailyQuoteService, type DailyQuote } from '../../src/services/DailyQuoteService';
import { initializeModel } from '../../src/services/AIService';
import type { Note } from '../../src/models/Note';
import quotesJson from '../../src/data/philosopher_quotes.json';

const mockGenerateText = jest.mocked(generateText);

interface QuoteRow {
  id: string;
  text: string;
  author: string;
  tags: string[];
  source: string;
}

const quotes = quotesJson as QuoteRow[];

const CACHE_KEY = '@gitnotes:daily_quote';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

const AI_QUOTE_ID = 'aurelius-3';
const AI_DESCRIPTION = 'This speaks to the patience you described in your journal.';

const QUOTE_PERSONALIZATION_OFF_DESCRIPTION = 'A quote from our curated collection.';
const AI_FAILED_DESCRIPTION =
  'Could not generate a personalized quote. Showing a random selection from the collection.';

function makeNote(overrides: Partial<Note>): Note {
  return {
    id: 'note',
    title: 'Note',
    content: 'Some content',
    createdAt: 0,
    updatedAt: 0,
    tags: [],
    ...overrides,
  };
}

const journalNote = makeNote({
  id: 'journal-1',
  title: 'Journal 2026-08-20',
  tags: ['journal'],
  content: 'Reflecting on patience and what I can control.',
});
const plainNote = makeNote({ id: 'plain-1', title: 'Shopping', tags: ['errands'] });

function mockAIResponse(description: string = AI_DESCRIPTION): void {
  mockGenerateText.mockResolvedValue({
    text: JSON.stringify({ quoteId: AI_QUOTE_ID, description }),
  } as any);
}

function seededCacheQuote(overrides: Partial<DailyQuote> = {}): DailyQuote {
  return {
    quoteId: quotes[1].id,
    text: quotes[1].text,
    author: quotes[1].author,
    tags: quotes[1].tags,
    source: quotes[1].source,
    description: 'A cached description.',
    generatedAt: NOW,
    ...overrides,
  };
}

async function seedCache(quote: DailyQuote): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(quote));
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockAIStoreState.dailyQuoteEnabled = true;
  mockAIStoreState.dailyQuotePersonalizationEnabled = true;
  mockAIStoreState.aiPersonalizationEnabled = true;
  mockAIStoreState.selectedModelId = 'test-model';
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DailyQuoteService 4-state matrix', () => {
  it('ON/ON: generates an AI quote with source from the curated dataset', async () => {
    mockAIResponse();

    const quote = await dailyQuoteService.getDailyQuote([journalNote], [journalNote, plainNote]);

    expect(initializeModel).toHaveBeenCalledTimes(1);
    expect(generateText).toHaveBeenCalledTimes(1);

    const datasetEntry = quotes.find((q) => q.id === AI_QUOTE_ID);
    expect(datasetEntry).toBeDefined();
    expect(quote).not.toBeNull();
    expect(quote?.quoteId).toBe(AI_QUOTE_ID);
    expect(quote?.text).toBe(datasetEntry?.text);
    expect(quote?.author).toBe(datasetEntry?.author);
    expect(quote?.source).toBe(datasetEntry?.source);
    expect(quote?.description).toBe(AI_DESCRIPTION);
  });

  it('ON/OFF: returns a random quote from the local pool without touching AI or cache', async () => {
    mockAIStoreState.dailyQuotePersonalizationEnabled = false;
    jest.spyOn(Math, 'random').mockReturnValue(0);

    const quote = await dailyQuoteService.getDailyQuote([journalNote], [plainNote]);

    const firstInPool = quotes[0];
    expect(quote).not.toBeNull();
    expect(quote?.quoteId).toBe(firstInPool.id);
    expect(quote?.author).toBe(firstInPool.author);
    expect(quote?.source).toBe(firstInPool.source);
    expect(quote?.description).toBe(QUOTE_PERSONALIZATION_OFF_DESCRIPTION);
    expect(generateText).not.toHaveBeenCalled();
    expect(initializeModel).not.toHaveBeenCalled();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('OFF/ON: returns null when daily quote is disabled', async () => {
    mockAIStoreState.dailyQuoteEnabled = false;

    const quote = await dailyQuoteService.getDailyQuote([journalNote], [plainNote]);

    expect(quote).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it('OFF/OFF: returns null when everything is disabled', async () => {
    mockAIStoreState.dailyQuoteEnabled = false;
    mockAIStoreState.dailyQuotePersonalizationEnabled = false;

    const quote = await dailyQuoteService.getDailyQuote([], []);

    expect(quote).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });

  it('ON/ON with AI failure: falls back to the local pool', async () => {
    mockGenerateText.mockRejectedValue(new Error('boom'));
    jest.spyOn(Math, 'random').mockReturnValue(0);

    const quote = await dailyQuoteService.getDailyQuote([journalNote], [plainNote]);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(quote).not.toBeNull();
    expect(quote?.quoteId).toBe(quotes[0].id);
    expect(quote?.description).toBe(AI_FAILED_DESCRIPTION);
  });
});

describe('DailyQuoteService cache behaviour', () => {
  it('reads cache first and skips generation for a fresh cached quote', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const cached = seededCacheQuote();
    await seedCache(cached);

    const quote = await dailyQuoteService.getDailyQuote([journalNote], [plainNote]);

    expect(AsyncStorage.getItem).toHaveBeenCalledWith(CACHE_KEY);
    expect(quote).toEqual(cached);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('evicts a cached quote older than the 24h TTL and regenerates', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    await seedCache(seededCacheQuote({ generatedAt: NOW - DAY_MS - 1 }));
    mockAIResponse();

    const quote = await dailyQuoteService.getDailyQuote([journalNote], [plainNote]);

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(CACHE_KEY);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(quote?.quoteId).toBe(AI_QUOTE_ID);
    expect(quote?.description).toBe(AI_DESCRIPTION);
  });

  it('writes a freshly generated quote to the cache', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockAIResponse();

    const quote = await dailyQuoteService.getDailyQuote([journalNote], [plainNote]);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(CACHE_KEY, JSON.stringify(quote));
    const storedRaw = await AsyncStorage.getItem(CACHE_KEY);
    expect(JSON.parse(storedRaw ?? '')).toEqual(quote);
  });
});

describe('DailyQuoteService.regenerate', () => {
  it('ignores the cached quote, generates a fresh one, and rewrites the cache', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const cached = seededCacheQuote();
    await seedCache(cached);
    mockAIResponse('A brand new description.');

    const quote = await dailyQuoteService.regenerate([journalNote], [plainNote]);

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(CACHE_KEY);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(quote?.quoteId).toBe(AI_QUOTE_ID);
    expect(quote?.description).toBe('A brand new description.');
    expect(quote?.description).not.toBe(cached.description);

    const storedRaw = await AsyncStorage.getItem(CACHE_KEY);
    expect(JSON.parse(storedRaw ?? '')).toEqual(quote);
  });
});
