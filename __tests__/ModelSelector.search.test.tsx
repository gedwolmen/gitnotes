import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const stableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
  accent: '#8b5cf6',
};

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: stableColors, isDark: false }),
  useTokens: () => ({
    colors: stableColors,
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 },
    radii: { sm: 12, md: 18, lg: 24, pill: 999 },
    style: 'flat',
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../src/components/ui', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    Group: ({ title, children }: any) => (
      <View testID={`group-${title}`}>
        <Text>{title}</Text>
        {children}
      </View>
    ),
    GroupRow: ({ children, onPress, testID }: any) => (
      <Pressable testID={testID} onPress={onPress}>
        {children}
      </Pressable>
    ),
  };
});

jest.mock('../src/services/AIService', () => ({
  downloadModel: jest.fn(),
  getModelStatus: jest.fn(async () => 'ready'),
}));

jest.mock('../src/services/ai/providerAvailability', () => ({
  resolveProviderAvailability: jest.fn(async () => ({ kind: 'available' })),
}));

jest.mock('../src/services/ai/providerAvailabilityCopy', () => ({
  describeAvailability: jest.fn(() => 'unavailable'),
}));

const mockProviders = [
  {
    id: 'openai',
    type: 'openai-compatible',
    name: 'OpenAI',
    isEnabled: true,
    addedAt: 0,
    models: [
      { id: 'm-gpt4o', name: 'gpt-4o', providerId: 'openai', providerType: 'openai-compatible', requiresDownload: false },
      { id: 'm-gpt4o-mini', name: 'gpt-4o-mini', providerId: 'openai', providerType: 'openai-compatible', requiresDownload: false },
    ],
  },
  {
    id: 'openrouter',
    type: 'openai-compatible',
    name: 'OpenRouter',
    isEnabled: true,
    addedAt: 0,
    models: [
      { id: 'm-claude', name: 'anthropic/claude-3.5-sonnet', providerId: 'openrouter', providerType: 'openai-compatible', requiresDownload: false },
      { id: 'm-llama', name: 'meta/llama-3.1-70b', providerId: 'openrouter', providerType: 'openai-compatible', requiresDownload: false },
    ],
  },
];

const mockAIStore = {
  providers: mockProviders,
  selectedModelId: null,
  selectModel: jest.fn(),
  updateProvider: jest.fn(),
};

jest.mock('../src/stores/aiStore', () => ({
  useAIStore: (selector: any) => (selector ? selector(mockAIStore) : mockAIStore),
}));

import { ModelSelector } from '../src/components/ai/ModelSelector';

describe('ModelSelector search', () => {
  test('typing filters model rows; clear restores; empty state shows', async () => {
    const { getByTestId, queryByTestId } = render(
      <ModelSelector visible onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(queryByTestId('model-selector.button.select-model-m-gpt4o')).toBeTruthy();
      expect(queryByTestId('model-selector.button.select-model-m-claude')).toBeTruthy();
    });

    const search = getByTestId('model-selector.input.search');
    fireEvent.changeText(search, 'mini');

    await waitFor(() => {
      expect(queryByTestId('model-selector.button.select-model-m-gpt4o-mini')).toBeTruthy();
      expect(queryByTestId('model-selector.button.select-model-m-gpt4o')).toBeNull();
      expect(queryByTestId('model-selector.button.select-model-m-claude')).toBeNull();
    });

    fireEvent.changeText(search, 'openrouter');
    await waitFor(() => {
      expect(queryByTestId('model-selector.button.select-model-m-claude')).toBeTruthy();
      expect(queryByTestId('model-selector.button.select-model-m-llama')).toBeTruthy();
      expect(queryByTestId('model-selector.button.select-model-m-gpt4o')).toBeNull();
    });

    fireEvent.changeText(search, 'xyzzy');
    await waitFor(() => {
      expect(getByTestId('model-selector.text.empty')).toBeTruthy();
    });

    fireEvent.press(getByTestId('model-selector.button.clear-search'));
    await waitFor(() => {
      expect(queryByTestId('model-selector.text.empty')).toBeNull();
      expect(queryByTestId('model-selector.button.select-model-m-gpt4o')).toBeTruthy();
      expect(queryByTestId('model-selector.button.select-model-m-claude')).toBeTruthy();
    });
  });
});
