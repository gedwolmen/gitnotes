import React from 'react';
import CanvasEditorContent from '../components/canvas/CanvasEditorContent';
import { useProScreenGuard } from '../hooks/useProScreenGuard';

export {
  clampCanvasTranslation,
  getCanvasContentBounds,
  getCanvasFitTranslation,
  moveCanvasElement,
} from '../components/canvas/CanvasEditorContent';

export default function CanvasEditorScreen() {
  const blocked = useProScreenGuard();
  if (blocked) return null;
  return <CanvasEditorContent />;
}
