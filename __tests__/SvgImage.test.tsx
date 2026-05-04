import React from 'react';
import { Text, View } from 'react-native';
import { act, render } from '@testing-library/react-native';

import SvgImage from '../src/components/SvgImage';

const mockImage = jest.fn((_props: unknown) => React.createElement(View, { testID: 'image' }));
const mockSvgUri = jest.fn(({ uri, width, height, color, onError }: {
  uri: string;
  width?: number;
  height?: number;
  color?: string;
  onError?: () => void;
}) => React.createElement(View, { testID: 'svg-uri', accessibilityLabel: uri, onTouchStart: onError },
  React.createElement(Text, null, `w:${width ?? ''}`),
  React.createElement(Text, null, `h:${height ?? ''}`),
  React.createElement(Text, null, `color:${color ?? ''}`),
));

jest.mock('expo-image', () => ({
  Image: (props: unknown) => mockImage(props),
}));

jest.mock('react-native-svg', () => ({
  SvgUri: (props: unknown) => mockSvgUri(props as never),
}));

describe('SvgImage', () => {
  beforeEach(() => {
    mockImage.mockClear();
    mockSvgUri.mockClear();
  });

  it('renders svg from uri with tint color in dark mode', () => {
    const { getByTestId, getByText } = render(
      <SvgImage uri="https://example.com/icon.svg" width={24} height={32} tintColor="#fff" isDark />,
    );

    expect(getByTestId('svg-uri')).toBeTruthy();
    expect(getByText('w:24')).toBeTruthy();
    expect(getByText('h:32')).toBeTruthy();
    expect(getByText('color:#fff')).toBeTruthy();
    expect(mockImage).not.toHaveBeenCalled();
  });

  it('shows error state for invalid svg', () => {
    const { getByText } = render(<SvgImage uri="https://example.com/broken.svg" isDark />);

    const rendered = mockSvgUri.mock.calls[0]?.[0] as { onError?: () => void } | undefined;
    act(() => {
      rendered?.onError?.();
    });

    expect(getByText('Failed to load SVG')).toBeTruthy();
  });

  it('accepts width and height props', () => {
    render(<SvgImage uri="https://example.com/shape.svg" width={111} height={222} isDark={false} />);

    expect(mockSvgUri).toHaveBeenCalledWith(expect.objectContaining({ width: 111, height: 222 }));
  });

  it('falls back to image for non-svg uris', () => {
    render(<SvgImage uri="https://example.com/photo.png" isDark={false} />);

    expect(mockImage).toHaveBeenCalledWith(expect.objectContaining({ source: { uri: 'https://example.com/photo.png' } }));
    expect(mockSvgUri).not.toHaveBeenCalled();
  });
});
