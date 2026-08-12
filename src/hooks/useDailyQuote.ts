import { useState, useEffect, useCallback } from 'react';
import { useNotes } from '../contexts/NoteContext';
import { dailyQuoteService, type DailyQuote } from '../services/DailyQuoteService';

interface UseDailyQuoteReturn {
  quote: DailyQuote | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDailyQuote(): UseDailyQuoteReturn {
  const [quote, setQuote] = useState<DailyQuote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { notes } = useNotes();

  const loadQuote = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const journals = notes.filter((n) => n.tags.includes('journal'));
      const result = await dailyQuoteService.getDailyQuote(journals, notes);
      setQuote(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load daily quote';
      setError(msg);
      console.error('[useDailyQuote] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [notes]);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const journals = notes.filter((n) => n.tags.includes('journal'));
      const result = await dailyQuoteService.regenerate(journals, notes);
      setQuote(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh daily quote';
      setError(msg);
      console.error('[useDailyQuote] Refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [notes]);

  useEffect(() => {
    loadQuote();
  }, [loadQuote]);

  return { quote, isLoading, error, refresh };
}
