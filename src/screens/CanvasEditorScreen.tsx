import React from 'react';
import CanvasEditorContent from '../components/canvas/CanvasEditorContent';
import { useProGate } from '../hooks/useProGate';
import { ProRequired } from '../components/paywall/ProRequired';

export {
  clampCanvasTranslation,
  getCanvasContentBounds,
  getCanvasFitTranslation,
  moveCanvasElement,
} from '../components/canvas/CanvasEditorContent';

export default function CanvasEditorScreen() {
  const { isPro } = useProGate();
  if (!isPro) return <ProRequired />;
  return <CanvasEditorContent />;
}
