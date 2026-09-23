import React from 'react';
import { useProScreenGuard } from '../hooks/useProScreenGuard';
import DiagramEditorContent from '../components/diagram/DiagramEditorContent';

/**
 * Diagram editor screen — Pro-gated shell.
 *
 * The actual editor (DiagramEditorContent) provides the full touch-native
 * ASCII diagram editing surface. This screen handles Pro gating and deep-link routing.
 */
export default function DiagramEditorScreen() {
  const blocked = useProScreenGuard();

  if (blocked) return null;

  return <DiagramEditorContent />;
}
