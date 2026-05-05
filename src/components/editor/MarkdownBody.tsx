import React from 'react';
import type { RendererInterface } from 'react-native-marked';

import { getMarkdownStyles } from '../../utils/preview';
import { MarkdownPreviewContent, NotePreviewRenderer } from '../../utils/markdownRenderer';

interface MarkdownBodyProps {
  value: string;
  styles: ReturnType<typeof getMarkdownStyles>;
  renderer?: RendererInterface;
}

export function MarkdownBody({ value, styles, renderer }: MarkdownBodyProps) {
  if (renderer instanceof NotePreviewRenderer) {
    return <MarkdownPreviewContent value={value} styles={styles} renderer={renderer} />;
  }

  return null;
}
