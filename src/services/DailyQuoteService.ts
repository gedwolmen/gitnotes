import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateText } from 'ai';
import type { Note } from '../models/Note';
import { useAIStore } from '../stores/aiStore';
import { initializeModel } from './AIService';
import quotesJson from '../data/philosopher_quotes.json';

export interface DailyQuote {
  quoteId: string;
  text: string;
  author: string;
  tags: string[];
  description: string;
  generatedAt: number;
}

interface QuoteRow {
  id: string;
  text: string;
  author: string;
  tags: string[];
}

const CACHE_KEY = '@gitnotes:daily_quote';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const quotes: QuoteRow[] = quotesJson as QuoteRow[];

const GENERIC_DESCRIPTION = 'A timeless reflection to carry with you today.';

function makeFallback(): DailyQuote {
  const random = quotes[Math.floor(Math.random() * quotes.length)];
  return {
    quoteId: random.id,
    text: random.text,
    author: random.author,
    tags: random.tags,
    description: GENERIC_DESCRIPTION,
    generatedAt: Date.now(),
  };
}

class DailyQuoteServiceClass {
  async getDailyQuote(journals: Note[], allNotes: Note[]): Promise<DailyQuote | null> {
    try {
      const cached = await this.readCache();
      if (cached) return cached;

      const aiStore = useAIStore.getState();
      if (!aiStore.dailyQuoteEnabled) return makeFallback();

      const selectedModel = aiStore.getSelectedModel();
      if (!selectedModel) return makeFallback();

      if (journals.length === 0) return makeFallback();

      const aiQuote = await this.generateAIQuote(journals, allNotes).catch(() => null);
      if (aiQuote) {
        await this.writeCache(aiQuote).catch(() => {});
        return aiQuote;
      }

      return makeFallback();
    } catch (error) {
      console.error('[DailyQuoteService] Error:', error);
      return makeFallback();
    }
  }

  async regenerate(journals: Note[], allNotes: Note[]): Promise<DailyQuote | null> {
    await this.clearCache().catch(() => {});
    return this.getDailyQuote(journals, allNotes);
  }

  async clearCache(): Promise<void> {
    await AsyncStorage.removeItem(CACHE_KEY);
  }

  private async readCache(): Promise<DailyQuote | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as DailyQuote;
      const ageMs = Date.now() - data.generatedAt;
      if (ageMs > CACHE_TTL_MS) {
        await AsyncStorage.removeItem(CACHE_KEY);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  private async writeCache(quote: DailyQuote): Promise<void> {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(quote));
  }

  private async generateAIQuote(journals: Note[], allNotes: Note[]): Promise<DailyQuote | null> {
    const aiStore = useAIStore.getState();
    const selectedModel = aiStore.getSelectedModel();
    if (!selectedModel) return null;

    const model = await initializeModel(selectedModel);

    const shuffled = [...quotes].sort(() => Math.random() - 0.5);
    const sampleQuotes = shuffled.slice(0, 20);

    const recentJournals = journals.slice(0, 5);
    const journalText = recentJournals
      .map((j, i) => `[Journal ${i + 1}]\n${j.content.slice(0, 800)}`)
      .join('\n\n');

    const result = await generateText({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a wise philosophical mentor. Review the user\'s recent journal entries and select ONE quote from the provided list that best resonates with their current themes. Then write a personalized 2-3 sentence description connecting the quote to their reflections. Reply ONLY with valid JSON in this EXACT format:\n{"quoteId": "the-quote-id", "description": "your personalized description"}',
        },
        {
          role: 'user',
          content: `Recent journal entries:\n\n${journalText}\n\nAvailable quotes to choose from (each has id, text, author, tags):\n${JSON.stringify(sampleQuotes, null, 2)}\n\nSelect the best matching quote and write a personalized description.`,
        },
      ],
    });

    const raw = (result.text || '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { quoteId: string; description: string };
    if (!parsed.quoteId || !parsed.description) return null;

    const quote = quotes.find((q) => q.id === parsed.quoteId);
    if (!quote) return null;

    return {
      quoteId: quote.id,
      text: quote.text,
      author: quote.author,
      tags: quote.tags,
      description: parsed.description.slice(0, 500),
      generatedAt: Date.now(),
    };
  }
}

export const dailyQuoteService = new DailyQuoteServiceClass();
