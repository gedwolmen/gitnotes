import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { NeorgContentParser } from '../src/services/NeorgContentParser';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { TestThemeProvider } from './ui/testThemeProvider';

describe('Neorg null guard and ErrorBoundary', () => {
  it('returns a structured error for null content', () => {
    const result = NeorgContentParser.parseContent(null as unknown as string);

    expect(result.success).toBe(false);
    expect(result.blocks).toEqual([]);
    expect(result.error).toBe('Invalid content: expected string');
  });

  it('returns a structured error for undefined content', () => {
    const result = NeorgContentParser.parseContent(undefined as unknown as string);

    expect(result.success).toBe(false);
    expect(result.blocks).toEqual([]);
    expect(result.error).toBe('Invalid content: expected string');
  });

  it('catches render errors and shows fallback UI', () => {
    const Boom = () => {
      throw new Error('boom');
    };

    const { getByText, queryByText } = render(
      React.createElement(
        TestThemeProvider,
        null,
        React.createElement(ErrorBoundary, { children: React.createElement(Boom) }),
      ),
    );

    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
    expect(queryByText('boom')).toBeNull();
  });

  it('renders a custom fallback when provided', () => {
    const Boom = () => {
      throw new Error('boom');
    };

    const { getByText, queryByText } = render(
      React.createElement(
        TestThemeProvider,
        null,
        React.createElement(
          ErrorBoundary,
          {
            fallback: React.createElement(Text, null, 'custom fallback'),
            children: React.createElement(Boom),
          },
        ),
      ),
    );

    expect(getByText('custom fallback')).toBeTruthy();
    expect(queryByText('Something went wrong')).toBeNull();
  });
});
