import type { Note } from '../../src/models/Note';
import type { DailyQuote } from '../../src/services/DailyQuoteService';

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

const mockNotes: Note[] = [
  makeNote({
    id: 'journal-1',
    title: 'Journal 2026-08-20',
    tags: ['journal'],
    content: 'Reflecting on patience.',
  }),
  makeNote({ id: 'plain-1', title: 'Shopping', tags: ['errands'] }),
];

jest.mock('../../src/contexts/NoteContext', () => ({
  useNotes: () => ({ notes: mockNotes }),
}));

const mockDailyQuoteService = {
  getDailyQuote: jest.fn(),
  regenerate: jest.fn(),
  clearCache: jest.fn(),
};

jest.mock('../../src/services/DailyQuoteService', () => ({
  get dailyQuoteService() {
    return mockDailyQuoteService;
  },
}));

interface MockAIState {
  isLoading: boolean;
  selectedModelId: string | null;
  dailyQuoteEnabled: boolean;
  dailyQuotePersonalizationEnabled: boolean;
}

const mockAIState: MockAIState = {
  isLoading: false,
  selectedModelId: 'test-model',
  dailyQuoteEnabled: true,
  dailyQuotePersonalizationEnabled: true,
};

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: (selector: (state: MockAIState) => unknown) => selector(mockAIState),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDailyQuote } from '../../src/hooks/useDailyQuote';

const sampleQuote: DailyQuote = {
  quoteId: 'aurelius-3',
  text: 'Waste no more time arguing what a good man should be. Be one.',
  author: 'Marcus Aurelius',
  tags: ['action'],
  source: 'Meditations, 10.16',
  description: 'A personalized description.',
  generatedAt: 1_700_000_000_000,
};

function resetStoreState(): void {
  mockAIState.isLoading = false;
  mockAIState.selectedModelId = 'test-model';
  mockAIState.dailyQuoteEnabled = true;
  mockAIState.dailyQuotePersonalizationEnabled = true;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStoreState();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useDailyQuote', () => {
  it('returns null and never calls the service when the daily quote is disabled', async () => {
    mockAIState.dailyQuoteEnabled = false;

    const { result } = renderHook(() => useDailyQuote());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.quote).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockDailyQuoteService.getDailyQuote).not.toHaveBeenCalled();
  });

  it('loads the quote from the service when enabled, passing journals first', async () => {
    mockDailyQuoteService.getDailyQuote.mockResolvedValue(sampleQuote);

    const { result } = renderHook(() => useDailyQuote());

    await waitFor(() => expect(result.current.quote).toBe(sampleQuote));
    expect(result.current.error).toBeNull();
    expect(mockDailyQuoteService.getDailyQuote).toHaveBeenCalledTimes(1);
    expect(mockDailyQuoteService.getDailyQuote).toHaveBeenCalledWith(
      [mockNotes[0]],
      mockNotes,
    );
  });

  it('re-reads the quote when quote personalization is toggled', async () => {
    mockDailyQuoteService.getDailyQuote.mockResolvedValue(sampleQuote);

    const { result, rerender } = renderHook(() => useDailyQuote());
    await waitFor(() => expect(mockDailyQuoteService.getDailyQuote).toHaveBeenCalledTimes(1));

    mockAIState.dailyQuotePersonalizationEnabled = false;
    rerender();

    await waitFor(() => expect(mockDailyQuoteService.getDailyQuote).toHaveBeenCalledTimes(2));
    expect(result.current.quote).toBe(sampleQuote);
  });

  it('reports isLoading true while the service is in flight, then false with the quote', async () => {
    let resolveQuote: (quote: DailyQuote) => void = () => {};
    const pending = new Promise<DailyQuote>((resolve) => {
      resolveQuote = resolve;
    });
    mockDailyQuoteService.getDailyQuote.mockReturnValue(pending);

    const { result } = renderHook(() => useDailyQuote());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.quote).toBeNull();

    await act(async () => {
      resolveQuote(sampleQuote);
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.quote).toBe(sampleQuote);
  });

  it('surfaces the error message when the service throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockDailyQuoteService.getDailyQuote.mockRejectedValue(new Error('quote exploded'));

    const { result } = renderHook(() => useDailyQuote());

    await waitFor(() => expect(result.current.error).toBe('quote exploded'));
    expect(result.current.quote).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
