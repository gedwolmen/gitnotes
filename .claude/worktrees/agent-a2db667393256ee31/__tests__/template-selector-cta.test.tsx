// Stash the nav mock so it's accessible after jest.mock() hoisting.
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => React.createElement(Text, null, name) };
});

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      surfaceSecondary: '#eee',
      elevated: '#fff',
      card: '#fff',
      shadow: '#000',
      primary: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
    },
  }),
}));

jest.mock('../src/components/ui', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Modal: ({ visible, children }: any) => (visible ? <View>{children}</View> : null),
  };
});

jest.mock('../src/services/TemplateService', () => ({
  TemplateService: {
    getAllTemplates: jest.fn(async () => []),
    searchTemplates: jest.fn(async () => []),
  },
}));

import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import TemplateSelector from '../src/components/TemplateSelector';

describe('TemplateSelector CTA', () => {
  const onClose = jest.fn();
  const onSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the "New custom template" CTA', async () => {
    const { getByLabelText } = render(
      <TemplateSelector visible={true} onClose={onClose} onSelect={onSelect} />
    );

    await waitFor(() => expect(getByLabelText('New custom template')).toBeTruthy());
  });

  it('calls onClose and navigates to TemplateManager when CTA is pressed', async () => {
    const { getByLabelText } = render(
      <TemplateSelector visible={true} onClose={onClose} onSelect={onSelect} />
    );

    await waitFor(() => expect(getByLabelText('New custom template')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByLabelText('New custom template'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('TemplateManager');
  });

  it('does not render the CTA when picker is not visible', () => {
    const { queryByLabelText } = render(
      <TemplateSelector visible={false} onClose={onClose} onSelect={onSelect} />
    );

    expect(queryByLabelText('New custom template')).toBeNull();
  });
});
