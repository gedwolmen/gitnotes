import React, { type ReactNode } from 'react';
import { Text, type TextStyle, type ViewStyle, type ImageStyle, type ScrollView, Linking } from 'react-native';
import { Renderer, type RendererInterface } from 'react-native-marked';
import { Image } from 'expo-image';

import { isCanvasLink, canvasIdFromLink } from '../models/Canvas';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

interface CustomRendererDeps {
  colors: {
    primary: string;
    text: string;
    surfaceSecondary?: string;
  };
  navigation?: {
    navigate: (screen: string, params: Record<string, unknown>) => void;
  };
  previewContent?: string;
  previewScrollRef?: React.RefObject<ScrollView | null>;
  CanvasPreview?: React.ComponentType<{ canvasId: string }>;
  approxLinePx?: number;
}

export class NotePreviewRenderer extends Renderer implements RendererInterface {
  private deps: CustomRendererDeps;

  constructor(deps: CustomRendererDeps) {
    super();
    this.deps = deps;
  }

  private renderCanvasFallback(id: string): ReactNode {
    return (
      <Text
        key={`canvas-fallback-${id}`}
        selectable
        style={{
          color: this.deps.colors.text,
          backgroundColor: this.deps.colors.surfaceSecondary ?? '#f0f0f0',
          borderRadius: 8,
          overflow: 'hidden',
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        Canvas preview unavailable
      </Text>
    );
  }

  image(uri: string, alt?: string, _style?: ImageStyle): ReactNode {
    const isCanvas = /canvas-drawings\/canvas-/.test(uri) || /^canvas-/.test(alt ?? '');
    if (isCanvas) {
      const pngUri = /\.json(\?|$)/i.test(uri)
        ? uri.split('?')[0].replace(/\.json$/i, '.png')
        : uri;
      return (
        <Image
          key={this.getKey()}
          source={{ uri: pngUri }}
          contentFit="contain"
          accessibilityLabel={alt || undefined}
          style={{ width: '100%', height: 240, borderRadius: 6, backgroundColor: '#fff' }}
        />
      );
    }
    return (
      <Image
        key={this.getKey()}
        source={{ uri }}
        contentFit="contain"
        accessibilityLabel={alt || undefined}
        style={{
          width: '100%',
          height: 240,
          borderRadius: 6,
          backgroundColor: this.deps.colors.surfaceSecondary ?? '#f0f0f0',
        }}
      />
    );
  }

  link(children: string | ReactNode[], href: string, styles?: TextStyle): ReactNode {
    if (isCanvasLink(href) && this.deps.CanvasPreview) {
      const id = canvasIdFromLink(href);
      return React.createElement(
        ErrorBoundary,
        { key: `canvas-boundary-${id}`, fallback: this.renderCanvasFallback(id) },
        React.createElement(this.deps.CanvasPreview, { key: id, canvasId: id }),
      );
    }

    const onPress = () => {
      if (!href) return;
      if (href.startsWith('note:')) {
        const id = href.slice('note:'.length);
        if (id && this.deps.navigation) {
          this.deps.navigation.navigate('NoteEditor', { noteId: id });
        }
        return;
      }
      if (href.startsWith('#')) {
        const slug = href.slice(1).toLowerCase();
        const content = this.deps.previewContent ?? '';
        const target = content
          .split('\n')
          .findIndex((line) => {
            const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
            if (!m) return false;
            const headingSlug = m[1]
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '');
            return headingSlug === slug;
          });
        if (target >= 0 && this.deps.previewScrollRef?.current) {
          const px = this.deps.approxLinePx ?? 22;
          this.deps.previewScrollRef.current.scrollTo({ y: target * px, animated: true });
        }
        return;
      }
      Linking.openURL(href).catch(() => {});
    };

    return (
      <Text
        key={this.getKey()}
        selectable
        style={[styles, { color: this.deps.colors.primary, textDecorationLine: 'underline' }]}
        onPress={onPress}
      >
        {children}
      </Text>
    );
  }

  text(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <Text key={this.getKey()} selectable style={styles}>
        {text}
      </Text>
    );
  }

  codespan(text: string, styles?: TextStyle): ReactNode {
    return (
      <Text key={this.getKey()} selectable style={styles}>
        {text}
      </Text>
    );
  }

  code(text: string, _language?: string, containerStyle?: ViewStyle, textStyle?: TextStyle): ReactNode {
    return (
      <Text key={this.getKey()} selectable style={[containerStyle, textStyle]}>
        {text}
      </Text>
    );
  }
}
