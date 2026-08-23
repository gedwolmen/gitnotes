# Testing Guide

> Test patterns, mocking, CI configuration.

## Overview

GitNotēs uses **Jest** with **React Native Testing Library**. Tests run in Node environment with Babel transforms.

## Setup

### Configuration

`jest.config.js`:

```javascript
module.exports = {
  preset: '@react-native/jest-preset',
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': 'babel-jest',
    '^.+\\.tsx$': 'babel-jest',
  },
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/?(*.)+(spec|test).{ts,tsx}',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '\\.(css)$': '<rootDir>/__mocks__/styleMock.js',
    '^expo-blur$': '<rootDir>/__mocks__/expo-blur.ts',
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/expo-file-system-legacy.ts',
    '^expo-image$': '<rootDir>/__mocks__/expo-image.ts',
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.ts',
    '^@ai-sdk/anthropic$': '<rootDir>/__mocks__/ai-sdk-anthropic.ts',
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.worktrees/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|expo|expo-[^/]+|@expo|react-native-reanimated|@shopify|nativewind|react-native-css|@rn-primitives|class-variance-authority|tailwind-merge|tailwindcss-animate)/)',
  ],
  collectCoverage: true,
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/',
    '/.worktrees/',
  ],
};
```

### Setup Files

`jest.setup.ts`:

```typescript
// Global mocks
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));

// Silence console warnings in tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (!args[0].includes('Animated: `useNativeDriver`')) {
    originalWarn(...args);
  }
};
```

## Test Patterns

### Service Tests

```typescript
// __tests__/services/DailyQuoteService.test.ts

import { dailyQuoteService } from '../../src/services/DailyQuoteService';

jest.mock('ai', () => ({
  streamText: jest.fn(() => ({
    textStream: (async function* () { yield 'response'; })(),
  })),
  generateText: jest.fn(() => Promise.resolve({
    text: JSON.stringify({ quoteId: 'test', description: 'test' }),
  })),
}));

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: {
    getState: jest.fn(() => ({
      aiPersonalizationEnabled: true,
      selectedModel: { id: 'gpt-4', providerType: 'openai-compatible' },
    })),
  },
}));

jest.mock('../../src/services/StorageService', () => ({
  default: {
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve()),
  },
}));

describe('DailyQuoteService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-13T12:00:00Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns generic quote when personalization disabled', async () => {
    const mockStore = jest.mocked(require('../../src/stores/aiStore').useAIStore);
    mockStore.getState = jest.fn(() => ({
      aiPersonalizationEnabled: false,
      selectedModel: null,
    }));

    const quote = await dailyQuoteService.fetchQuote();
    expect(quote.description).toBe(
      'A timeless reflection from philosophy — personalization is off.',
    );
  });

  it('caches quotes for 24 hours', async () => {
    // First call
    await dailyQuoteService.fetchQuote();
    
    // Advance 23 hours (still cached)
    jest.advanceTimersByTime(23 * 60 * 60 * 1000);
    const cached = await dailyQuoteService.fetchQuote();
    expect(cached).toBeDefined();

    // Advance 1 more hour (cache expired)
    jest.advanceTimersByTime(60 * 60 * 1000);
    const fresh = await dailyQuoteService.fetchQuote();
    expect(fresh).toBeDefined();
  });
});
```

### Component Tests

```typescript
// __tests__/components/DailyQuoteCard.test.tsx

import { render } from '@testing-library/react-native';
import { DailyQuoteCard } from '../../src/components/home/DailyQuoteCard';

const mockQuote = {
  quoteId: 'test-1',
  quote: 'The only way to do great work is to love what you do.',
  author: 'Confucius',
  description: 'A reflection on passion and purpose.',
  generatedAt: Date.now(),
};

describe('DailyQuoteCard', () => {
  it('renders quote and author', () => {
    const { getByText } = render(<DailyQuoteCard quote={mockQuote} />);
    
    expect(getByText(/The only way to do great work/)).toBeTruthy();
    expect(getByText(/Confucius/)).toBeTruthy();
  });

  it('renders nothing when quote is null', () => {
    const { toJSON } = render(<DailyQuoteCard quote={null} />);
    expect(toJSON()).toBeNull();
  });

  it('shows refresh button when onRefresh provided', () => {
    const onRefresh = jest.fn();
    const { getByTestId } = render(
      <DailyQuoteCard quote={mockQuote} onRefresh={onRefresh} />,
    );
    
    const refreshBtn = getByTestId('refresh-quote');
    expect(refreshBtn).toBeTruthy();
  });
});
```

### Hook Tests

```typescript
// __tests__/hooks/useDailyQuote.test.ts

import { renderHook, waitFor } from '@testing-library/react-native';
import { useDailyQuote } from '../../src/hooks/useDailyQuote';

jest.mock('../../src/services/DailyQuoteService', () => ({
  dailyQuoteService: {
    fetchQuote: jest.fn(() => Promise.resolve({
      quoteId: 'test',
      quote: 'Test quote',
      author: 'Test author',
      description: 'Test description',
      generatedAt: Date.now(),
    })),
  },
}));

describe('useDailyQuote', () => {
  it('fetches quote on mount', async () => {
    const { result } = renderHook(() => useDailyQuote());
    
    await waitFor(() => {
      expect(result.current.quote).toBeDefined();
      expect(result.current.loading).toBe(false);
    });
  });

  it('exposes refresh function', async () => {
    const { result } = renderHook(() => useDailyQuote());
    
    await waitFor(() => !result.current.loading);
    
    expect(typeof result.current.refresh).toBe('function');
  });
});
```

## Mocking Patterns

### React Native Modules

```typescript
// __mocks__/react-native.js
module.exports = {
  Platform: { OS: 'ios', select: jest.fn((obj) => obj.ios) },
  StyleSheet: { create: (styles) => styles },
  View: 'View',
  Text: 'Text',
  // ...
};
```

### Expo Modules

```typescript
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { name: 'GitNotēs' } },
}));
```

### AsyncStorage

```typescript
// jest.setup.ts (global)
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    getItem: jest.fn((key) => Promise.resolve(store[key] || null)),
    setItem: jest.fn((key, value) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
      return Promise.resolve();
    }),
  };
});
```

## CI Pipeline

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-test:
    name: TypeScript + Jest
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
          cache: 'yarn'

      - run: yarn install --frozen-lockfile
      - run: yarn ts:check
      - run: yarn lint
      - run: yarn format:check
      - run: yarn jest --coverage
```

## Coverage

```bash
yarn jest --coverage
open coverage/lcov-report/index.html
```

Target: 70%+ line coverage for services, 60%+ for components.

## Debugging Tests

```bash
# Run with verbose output
yarn jest --verbose

# Run single test
yarn jest -t 'test name'

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```
