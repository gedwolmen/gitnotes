import type { DailyQuote } from '../../../src/services/DailyQuoteService';

const mockCardAIState = {
  dailyQuoteSourceVisible: true,
};

jest.mock('../../../src/stores/aiStore', () => ({
  useAIStore: (selector: (state: typeof mockCardAIState) => unknown) =>
    selector(mockCardAIState),
}));

jest.mock('../../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      primary: '#2563eb',
      accent: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
    },
  }),
}));

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { DailyQuoteCard } from '../../../src/components/home/DailyQuoteCard';

const quote: DailyQuote = {
  quoteId: 'aurelius-3',
  text: 'Waste no more time arguing what a good man should be. Be one.',
  author: 'Marcus Aurelius',
  tags: ['action'],
  source: 'Meditations',
  description: 'This echoes your journal reflections on discipline.',
  generatedAt: 1_700_000_000_000,
};

beforeEach(() => {
  mockCardAIState.dailyQuoteSourceVisible = true;
});

describe('DailyQuoteCard', () => {
  it('renders nothing when there is no quote, loading, or error', () => {
    const view = render(<DailyQuoteCard quote={null} isLoading={false} />);
    expect(view.toJSON()).toBeNull();
  });

  it('shows the quote with the author line suffixed by the source', () => {
    const { getByText } = render(<DailyQuoteCard quote={quote} isLoading={false} />);

    expect(getByText(quote.text)).toBeTruthy();
    expect(getByText(/— Marcus Aurelius, Meditations/)).toBeTruthy();
    expect(getByText(quote.description)).toBeTruthy();
  });

  it('hides the source in the author line when the source toggle is off', () => {
    mockCardAIState.dailyQuoteSourceVisible = false;

    const { getByText, queryByText } = render(
      <DailyQuoteCard quote={quote} isLoading={false} />,
    );

    expect(getByText(/— Marcus Aurelius/)).toBeTruthy();
    expect(queryByText(/Meditations/)).toBeNull();
  });

  it('shows the loading placeholder while the quote is loading', () => {
    const { getByText, queryByText } = render(<DailyQuoteCard quote={null} isLoading />);

    expect(getByText('Finding your quote')).toBeTruthy();
    expect(queryByText(quote.text)).toBeNull();
  });

  it('shows the error with a retry button that triggers a refresh', () => {
    const onRefresh = jest.fn();

    const { getByText, getByTestId } = render(
      <DailyQuoteCard
        quote={null}
        isLoading={false}
        error="Could not load your quote"
        onRefresh={onRefresh}
      />,
    );

    expect(getByText('Could not load your quote')).toBeTruthy();
    const retry = getByTestId('daily-quote.retry');
    expect(getByText('Retry')).toBeTruthy();

    fireEvent.press(retry);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not render a retry affordance when no refresh handler is available', () => {
    const { getByText, queryByTestId } = render(
      <DailyQuoteCard quote={null} isLoading={false} error="Could not load your quote" />,
    );

    expect(getByText('Could not load your quote')).toBeTruthy();
    expect(queryByTestId('daily-quote.retry')).toBeNull();
  });
});
