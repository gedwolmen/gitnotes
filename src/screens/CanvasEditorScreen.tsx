import React from 'react';
import CanvasEditorContent from '../components/canvas/CanvasEditorContent';

export {
  clampCanvasTranslation,
  getCanvasContentBounds,
  getCanvasFitTranslation,
  moveCanvasElement,
} from '../components/canvas/CanvasEditorContent';

export default function CanvasEditorScreen() {
  return <CanvasEditorContent />;
}
