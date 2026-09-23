/**
 * ASCII grid renderer for diagram editor.
 *
 * Renders a DrawDocument as a character grid using box-drawing characters,
 * with selection highlighting and active drawing preview.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

import type { BoxStyle, DrawDocument, InkColor, LineStyle } from '../../models/Diagram';
import {
  makeGrid,
  computeBoundingBox,
} from '../../services/diagram/core/render-grid';
import {
  renderBox,
  renderLine,
  renderElbow,
  renderPaint,
  renderText,
} from '../../services/diagram/core/ascii';
import { useTheme } from '../../contexts/ThemeContext';
import type { DrawingState } from './types';

interface GridRendererProps {
  document: DrawDocument;
  selectedIds: readonly string[];
  drawing: DrawingState | null;
  activeColor: InkColor;
  activeStyle: BoxStyle | LineStyle;
}

const CELL_SIZE = 12;
const GRID_WIDTH = 120;
const GRID_HEIGHT = 80;

export function GridRenderer({
  document,
  selectedIds: _selectedIds,
  drawing,
  activeColor,
  activeStyle,
}: GridRendererProps) {
  const { colors } = useTheme();

  const gridContent = useMemo(() => {
    const bounds = computeBoundingBox(document);
    const padding = 4;
    const w = Math.max(GRID_WIDTH, bounds.maxX - bounds.minX + 1 + padding * 2);
    const h = Math.max(GRID_HEIGHT, bounds.maxY - bounds.minY + 1 + padding * 2);
    const offsetX = -bounds.minX + padding;
    const offsetY = -bounds.minY + padding;

    const grid = makeGrid(w, h);

    // Render committed objects (sorted by z)
    const sorted = [...document.objects].sort((a, b) => a.z - b.z);
    for (const obj of sorted) {
      switch (obj.type) {
        case 'box':
          renderBox(grid, {
            ...obj,
            left: obj.left + offsetX,
            right: obj.right + offsetX,
            top: obj.top + offsetY,
            bottom: obj.bottom + offsetY,
          });
          break;
        case 'line':
          renderLine(grid, {
            ...obj,
            x1: obj.x1 + offsetX,
            y1: obj.y1 + offsetY,
            x2: obj.x2 + offsetX,
            y2: obj.y2 + offsetY,
          });
          break;
        case 'elbow':
          renderElbow(grid, {
            ...obj,
            x1: obj.x1 + offsetX,
            y1: obj.y1 + offsetY,
            x2: obj.x2 + offsetX,
            y2: obj.y2 + offsetY,
          });
          break;
        case 'paint':
          renderPaint(grid, {
            ...obj,
            points: obj.points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY })),
          });
          break;
        case 'text':
          renderText(grid, {
            ...obj,
            x: obj.x + offsetX,
            y: obj.y + offsetY,
          });
          break;
      }
    }

    // Render active drawing preview
    if (drawing) {
      const sx1 = drawing.startX + offsetX;
      const sy1 = drawing.startY + offsetY;
      const cx = drawing.currentX + offsetX;
      const cy = drawing.currentY + offsetY;

      if (drawing.type === 'box') {
        const left = Math.min(sx1, cx);
        const top = Math.min(sy1, cy);
        const right = Math.max(sx1, cx);
        const bottom = Math.max(sy1, cy);
        // Draw preview box with dashed style
        for (let bx = left; bx <= right; bx++) {
          if (top >= 0 && top < h) grid[top]![bx] = '─';
          if (bottom >= 0 && bottom < h) grid[bottom]![bx] = '─';
        }
        for (let by = top; by <= bottom; by++) {
          if (by >= 0 && by < h) grid[by]![left] = '│';
          if (by >= 0 && by < h) grid[by]![right] = '│';
        }
        if (top >= 0 && top < h) grid[top]![left] = '┌';
        if (top >= 0 && top < h) grid[top]![right] = '┐';
        if (bottom >= 0 && bottom < h) grid[bottom]![left] = '└';
        if (bottom >= 0 && bottom < h) grid[bottom]![right] = '┘';
      } else if (drawing.type === 'line') {
        renderLine(grid, { id: '', type: 'line', z: 999, parentId: null, color: activeColor, x1: sx1, y1: sy1, x2: cx, y2: cy, style: activeStyle as LineStyle });
      } else if (drawing.type === 'elbow') {
        renderElbow(grid, { id: '', type: 'elbow', z: 999, parentId: null, color: activeColor, x1: sx1, y1: sy1, x2: cx, y2: cy, style: activeStyle as LineStyle, orientation: 'horizontal-first' });
      } else if (drawing.type === 'paint' && drawing.points) {
        for (const pt of drawing.points) {
          renderPaint(grid, { id: '', type: 'paint', z: 999, parentId: null, color: activeColor, points: [{ x: pt.x + offsetX, y: pt.y + offsetY }], brush: '#' });
        }
      }
    }

    return grid;
  }, [document, drawing, activeColor, activeStyle]);

  return (
    <View style={styles.container} pointerEvents="none">
      {gridContent.map((row, rowIdx) => (
        <Text
          key={rowIdx}
          style={[
            styles.gridRow,
            {
              fontSize: CELL_SIZE,
              lineHeight: CELL_SIZE + 2,
              color: colors.text,
            },
          ]}
          selectable={false}
        >
          {row.join('')}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  gridRow: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    includeFontPadding: false,
  },
});
