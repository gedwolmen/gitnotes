import { useState, useCallback, useEffect, useRef } from 'react';
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

  const notesRef = useRef(notes); // ref so callbacks don't depend on unstable notes array
  notesRef.current = notes;

  const loadQuote = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const currentNotes = notesRef.current;
      const journals = currentNotes.filter((n) => n.tags.includes('journal'));
      const result = await dailyQuoteService.getDailyQuote(journals, currentNotes);
      setQuote(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load daily quote';
      setError(msg);
      console.error('[useDailyQuote] Error:', err);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notes read via ref
  }, []);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const currentNotes = notesRef.current;
      const journals = currentNotes.filter((n) => n.tags.includes('journal'));
      const result = await dailyQuoteService.regenerate(journals, currentNotes);
      setQuote(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh daily quote';
      setError(msg);
      console.error('[useDailyQuote] Refresh error:', err);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notes read via ref
  }, []);

  useEffect(() => {
    loadQuote();
  }, [loadQuote]);

  return { quote, isLoading, error, refresh };
}
