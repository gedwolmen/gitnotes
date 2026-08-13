import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import type { AIProviderConfig } from '../../src/models/AIProvider';

function getBgColor(element: any): string | undefined {
  const style = element.props.style;
  if (!style) return undefined;
  if (Array.isArray(style)) {
    for (const s of style) {
      if (s && typeof s === 'object' && s.backgroundColor !== undefined) return s.backgroundColor;
    }
    return undefined;
  }
  return style?.backgroundColor;
}

const stableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
};

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: stableColors, isDark: false }),
  useTokens: () => ({ spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: unknown) => {
    const { View } = require('react-native');
    return <View />;
  },
}));

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

const mockAddProvider = jest.fn(async () => undefined);
const mockUpdateProvider = jest.fn(async () => undefined);

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: { getState: () => ({ addProvider: mockAddProvider, updateProvider: mockUpdateProvider }) },
}));

jest.mock('../../src/services/ai/openrouterPreflight', () => ({
  checkOpenRouterKey: jest.fn(),
  isOpenRouterBaseURL: jest.fn(() => false),
}));

jest.mock('../../src/services/ai/anthropicDefaults', () => ({
  isAnthropicBaseURL: (v: string) => /api\.anthropic\.com/i.test(v) || /anthropic/i.test(v),
}));

jest.mock('../../src/services/ai/providerFactory', () => ({
  getFactory: (type: string) => ({
    testConnection: jest.fn(async () => ({
      models: [{ id: 'test-model', name: 'Test', providerId: 'test', providerType: type, requiresDownload: false }],
      message: 'Connected',
    })),
    requiresBaseURL: type !== 'anthropic',
    requiresApiKey: true,
    defaultBaseURL: type === 'anthropic' ? 'https://api.anthropic.com/v1' : undefined,
  }),
}));

jest.mock('../../src/components/ui', () => {
  const { View } = require('react-native');
  return {
    Group: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    GroupRow: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

import { ProviderConfigModal } from '../../src/components/ai/ProviderConfigModal';

describe('ProviderConfigModal API Type Selector', () => {
  beforeEach(() => {
    mockAddProvider.mockClear();
    mockUpdateProvider.mockClear();
  });

  test('renders API type toggle for non-built-in providers', () => {
    const { getByTestId } = render(
      <ProviderConfigModal visible onClose={jest.fn()} />,
    );
    expect(getByTestId('provider-config.button.api-type-openai')).toBeTruthy();
    expect(getByTestId('provider-config.button.api-type-anthropic')).toBeTruthy();
  });

  test('does NOT render API type toggle for built-in apple provider', () => {
    const appleProvider: AIProviderConfig = {
      id: 'apple-default',
      type: 'apple',
      name: 'Apple Intelligence',
      isEnabled: true,
      addedAt: 0,
      models: [],
    };
    const { queryByTestId } = render(
      <ProviderConfigModal visible onClose={jest.fn()} provider={appleProvider} />,
    );
    expect(queryByTestId('provider-config.button.api-type-openai')).toBeNull();
    expect(queryByTestId('provider-config.button.api-type-anthropic')).toBeNull();
  });

  test('tapping Anthropic toggles the selection', async () => {
    const { getByTestId } = render(
      <ProviderConfigModal visible onClose={jest.fn()} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('provider-config.button.api-type-anthropic'));
    });

    // After tapping, the Anthropic button should be selected
    const anthropicBtn = getByTestId('provider-config.button.api-type-anthropic');
    const openaiBtn = getByTestId('provider-config.button.api-type-openai');
    expect(getBgColor(anthropicBtn)).toBe(stableColors.primary);
    expect(getBgColor(openaiBtn)).toBe(stableColors.surface);
  });

  test('auto-detects Anthropic from base URL', async () => {
    const { getByTestId } = render(
      <ProviderConfigModal visible onClose={jest.fn()} />,
    );

    const urlInput = getByTestId('provider-config.input.base-url');
    await act(async () => {
      fireEvent.changeText(urlInput, 'https://api.anthropic.com/v1');
    });

    // After auto-detect, Anthropic button should be highlighted
    await waitFor(() => {
      const anthropicBtn = getByTestId('provider-config.button.api-type-anthropic');
      expect(getBgColor(anthropicBtn)).toBe(stableColors.primary);
    });
  });

  test('user tap override prevents auto-detect from changing selection', async () => {
    const { getByTestId } = render(
      <ProviderConfigModal visible onClose={jest.fn()} />,
    );

    // User explicitly taps OpenAI-compatible first
    await act(async () => {
      fireEvent.press(getByTestId('provider-config.button.api-type-openai'));
    });

    // Then types an Anthropic URL
    const urlInput = getByTestId('provider-config.input.base-url');
    await act(async () => {
      fireEvent.changeText(urlInput, 'https://api.anthropic.com/v1');
    });

    // OpenAI-compatible should still be selected (user override respected)
    const openaiBtn = getByTestId('provider-config.button.api-type-openai');
    expect(getBgColor(openaiBtn)).toBe(stableColors.primary);
  });

  test('editing existing anthropic provider initializes toggle correctly', () => {
    const anthropicConfig: AIProviderConfig = {
      id: 'my-anthropic',
      type: 'anthropic',
      name: 'My Claude',
      isEnabled: true,
      addedAt: Date.now(),
      models: [],
    };
    const { getByTestId } = render(
      <ProviderConfigModal visible onClose={jest.fn()} provider={anthropicConfig} />,
    );

    // Anthropic should be pre-selected
    const anthropicBtn = getByTestId('provider-config.button.api-type-anthropic');
    expect(getBgColor(anthropicBtn)).toBe(stableColors.primary);
  });

  test('handleSave uses explicit apiType for provider type', async () => {
    const { getByTestId } = render(
      <ProviderConfigModal visible onClose={() => {}} />
    );

    const nameInput = getByTestId('provider-config.input.name');
    const urlInput = getByTestId('provider-config.input.base-url');

    await act(async () => {
      fireEvent.changeText(nameInput, 'My Provider');
      fireEvent.changeText(urlInput, 'https://api.anthropic.com/v1');
    });

    // Tap Anthropic explicitly
    await act(async () => {
      fireEvent.press(getByTestId('provider-config.button.api-type-anthropic'));
    });

    // Save
    await act(async () => {
      fireEvent.press(getByTestId('provider-config-modal.button.save'));
    });

    await waitFor(() => {
      expect(mockAddProvider).toHaveBeenCalledTimes(1);
    });

    const savedProvider = mockAddProvider.mock.calls[0][0];
    expect(savedProvider.type).toBe('anthropic');
  });

  test('handleSave respects openai-compatible when URL looks anthropic but user chose openai', async () => {
    const { getByTestId } = render(
      <ProviderConfigModal visible onClose={() => {}} />
    );

    const nameInput = getByTestId('provider-config.input.name');
    const urlInput = getByTestId('provider-config.input.base-url');

    await act(async () => {
      fireEvent.changeText(nameInput, 'My Proxy');
      fireEvent.changeText(urlInput, 'https://anthropic-proxy.example.com/v1');
    });

    // Auto-detect will try to set Anthropic, but user explicitly taps OpenAI
    await act(async () => {
      fireEvent.press(getByTestId('provider-config.button.api-type-openai'));
    });

    await act(async () => {
      fireEvent.press(getByTestId('provider-config-modal.button.save'));
    });

    await waitFor(() => {
      expect(mockAddProvider).toHaveBeenCalledTimes(1);
    });

    const savedProvider = mockAddProvider.mock.calls[0][0];
    expect(savedProvider.type).toBe('openai-compatible');
  });
});
