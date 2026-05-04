import { renderWithTheme } from './helpers/renderWithTheme';
import ImageCaption from '../src/components/ImageCaption';

describe('ImageCaption', () => {
  it('renders caption text when provided', () => {
    const { getByText } = renderWithTheme(
      <ImageCaption text="A quiet lake" mode="inline" isDark={false} />,
    );

    expect(getByText('A quiet lake')).toBeTruthy();
  });

  it('uses absolute positioning in overlay mode', () => {
    const { getByTestId } = renderWithTheme(
      <ImageCaption text="Overlay caption" mode="overlay" isDark />,
    );

    expect(getByTestId('image-caption-overlay')).toHaveStyle({
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    });
  });

  it('renders inline caption without absolute positioning', () => {
    const { getByTestId } = renderWithTheme(
      <ImageCaption text="Inline caption" mode="inline" isDark={false} />,
    );

    expect(getByTestId('image-caption-inline')).toHaveStyle({
      position: 'relative',
    });
  });

  it('returns null when text is empty', () => {
    const { queryByTestId, queryByText } = renderWithTheme(
      <ImageCaption text="" mode="inline" isDark={false} />,
    );

    expect(queryByTestId('image-caption-inline')).toBeNull();
    expect(queryByText('')).toBeNull();
  });

  it('applies theme-aware text styling', () => {
    const { getByTestId } = renderWithTheme(
      <ImageCaption text="Styled" mode="inline" isDark={false} />,
    );

    expect(getByTestId('image-caption-text')).toHaveStyle({
      color: '#6E6E73',
    });

    const darkRender = renderWithTheme(
      <ImageCaption text="Styled" mode="inline" isDark />,
    );

    expect(darkRender.getByTestId('image-caption-text')).toHaveStyle({
      color: '#1C1C1E',
    });
  });
});
