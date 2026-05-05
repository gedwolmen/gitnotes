import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

interface PdfViewerProps {
  uri: string;
  token?: string | null;
  style?: StyleProp<ViewStyle>;
  onError?: (message: string) => void;
}

function isGitHubUrl(uri: string): boolean {
  return uri.includes('api.github.com/repos/') || uri.includes('raw.githubusercontent.com');
}

function loadNativePdfModule() {
  try {
    const maybeModule = require('react-native-pdf');
    if (maybeModule?.default) return maybeModule.default;
    return null;
  } catch (error) { void error;
    return null;
  }
}

export default function PdfViewer({ uri, token, style, onError }: PdfViewerProps) {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.raw',
  };

  if (token && isGitHubUrl(uri)) {
    headers.Authorization = `Bearer ${token}`;
  }

  const NativePdf = loadNativePdfModule();

  if (!NativePdf) {
    return (
      <WebView
        source={{ uri, headers }}
        style={style as ViewStyle}
        startInLoadingState
        javaScriptEnabled
        scalesPageToFit
        onError={(event) => {
          const message = event.nativeEvent?.description ?? 'Failed to load PDF.';
          onError?.(message);
        }}
      />
    );
  }

  return (
    <NativePdf
      source={{ uri, cache: true, headers }}
      style={style as ViewStyle}
      trustAllCerts={false}
      onError={(error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        onError?.(message);
      }}
    />
  );
}
