import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Canvas as SkiaCanvas,
  Path,
  Rect,
  Oval,
  RoundedRect,
  Fill,
  Group,
  Skia,
} from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';

import { useTheme } from '../contexts/ThemeContext';

interface Point { x: number; y: number; }

interface DrawStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  width: number;
  points: Point[];
}

interface DrawShape {
  id: string;
  shape: 'line' | 'rect' | 'roundRect' | 'ellipse' | 'diamond' | 'arrow';
  color: string;
  fillColor?: string;
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type DrawElement = DrawStroke | DrawShape;

interface SceneData {
  width?: number;
  height?: number;
  elements: DrawElement[];
}

interface InlineCanvasFilePreviewProps {
  jsonUri: string;
  onEdit: (jsonUri: string) => void;
}

function buildStrokePath(points: Point[]) {
  if (points.length === 0) return null;
  const p = Skia.Path.Make();
  p.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) p.lineTo(points[i].x, points[i].y);
  return p;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildArrowPath(x1: number, y1: number, x2: number, y2: number, sw: number) {
  const p = Skia.Path.Make();
  p.moveTo(x1, y1);
  p.lineTo(x2, y2);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const hl = Math.max(12, sw * 4);
  p.moveTo(x2, y2);
  p.lineTo(x2 - hl * Math.cos(ang - 0.4), y2 - hl * Math.sin(ang - 0.4));
  p.moveTo(x2, y2);
  p.lineTo(x2 - hl * Math.cos(ang + 0.4), y2 - hl * Math.sin(ang + 0.4));
  return p;
}

function buildDiamondPath(x1: number, y1: number, x2: number, y2: number) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const p = Skia.Path.Make();
  p.moveTo(cx, y1);
  p.lineTo(x2, cy);
  p.lineTo(cx, y2);
  p.lineTo(x1, cy);
  p.close();
  return p;
}

function buildLinePath(x1: number, y1: number, x2: number, y2: number) {
  const p = Skia.Path.Make();
  p.moveTo(x1, y1);
  p.lineTo(x2, y2);
  return p;
}

export default function InlineCanvasFilePreview({ jsonUri, onEdit }: InlineCanvasFilePreviewProps) {
  const { colors } = useTheme();
  const [scene, setScene] = useState<SceneData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cleanUri = jsonUri.split('?')[0];
        const raw = await FileSystem.readAsStringAsync(cleanUri);
        const parsed = JSON.parse(raw);
        if (cancelled) return;
        if (Array.isArray(parsed?.elements)) {
          setScene({ width: parsed.width, height: parsed.height, elements: parsed.elements });
        } else if (Array.isArray(parsed)) {
          setScene({ elements: parsed });
        } else {
          setError('Invalid canvas');
        }
      } catch (err) {
        if (!cancelled) setError('Canvas missing');
      }
    })();
    return () => { cancelled = true; };
  }, [jsonUri]);

  const previewWidth = Dimensions.get('window').width - 64;
  const previewHeight = 200;

  const { scale, elements } = useMemo(() => {
    if (!scene) return { scale: 1, elements: [] };
    const sw = scene.width ?? 800;
    const sh = scene.height ?? 600;
    const s = Math.min(previewWidth / sw, previewHeight / sh);
    return { scale: s, elements: scene.elements };
  }, [scene, previewWidth]);

  if (error) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Ionicons name="warning-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.missingText, { color: colors.textSecondary }]}>{error}</Text>
      </View>
    );
  }

  if (!scene) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Text style={[styles.missingText, { color: colors.textSecondary }]}>Loading canvas…</Text>
      </View>
    );
  }

  const renderElement = (el: DrawElement, idx: number): React.ReactElement | null => {
    if ('points' in el) {
      const path = buildStrokePath(el.points);
      if (!path) return null;
      const strokeColor = el.tool === 'highlighter' ? hexToRgba(el.color, 0.3) : el.color;
      return (
        <Group key={el.id ?? idx}>
          <Path path={path} color={strokeColor} style="stroke" strokeWidth={el.width} strokeCap="round" strokeJoin="round" />
        </Group>
      );
    }

    if ('shape' in el) {
      const { x1, y1, x2, y2, shape, color: sColor, fillColor, width: sw } = el;
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);

      if (shape === 'line') {
        return <Path key={el.id ?? idx} path={buildLinePath(x1, y1, x2, y2)} style="stroke" strokeWidth={sw} color={sColor} />;
      }
      if (shape === 'arrow') {
        return <Path key={el.id ?? idx} path={buildArrowPath(x1, y1, x2, y2, sw)} style="stroke" strokeWidth={sw} color={sColor} />;
      }
      if (shape === 'rect') {
        return (
          <Group key={el.id ?? idx}>
            {fillColor && <Rect x={minX} y={minY} width={w} height={h} color={fillColor} />}
            <Rect x={minX} y={minY} width={w} height={h} style="stroke" strokeWidth={sw} color={sColor} />
          </Group>
        );
      }
      if (shape === 'roundRect') {
        return (
          <Group key={el.id ?? idx}>
            {fillColor && <RoundedRect x={minX} y={minY} width={w} height={h} r={10} color={fillColor} />}
            <RoundedRect x={minX} y={minY} width={w} height={h} r={10} style="stroke" strokeWidth={sw} color={sColor} />
          </Group>
        );
      }
      if (shape === 'ellipse') {
        return (
          <Group key={el.id ?? idx}>
            {fillColor && <Oval x={minX} y={minY} width={w} height={h} color={fillColor} />}
            <Oval x={minX} y={minY} width={w} height={h} style="stroke" strokeWidth={sw} color={sColor} />
          </Group>
        );
      }
      if (shape === 'diamond') {
        const dp = buildDiamondPath(x1, y1, x2, y2);
        return (
          <Group key={el.id ?? idx}>
            {fillColor && <Path path={dp} color={fillColor} />}
            <Path path={dp} style="stroke" strokeWidth={sw} color={sColor} />
          </Group>
        );
      }
    }
    return null;
  };

  return (
    <TouchableOpacity
      onPress={() => onEdit(jsonUri)}
      activeOpacity={0.85}
      style={[styles.container, { borderColor: colors.border }]}
    >
      <View style={styles.canvasWrap}>
        <SkiaCanvas style={{ width: previewWidth, height: previewHeight }}>
          <Fill color="white" />
          <Group transform={[{ scale }]}>
            {elements.map(renderElement)}
          </Group>
        </SkiaCanvas>
      </View>
      <View style={[styles.footer, { backgroundColor: colors.surface }]}>
        <Ionicons name="brush-outline" size={14} color={colors.primary} />
        <Text style={[styles.footerText, { color: colors.primary }]}>Tap to edit drawing</Text>
        <Text style={[styles.footerMeta, { color: colors.textSecondary }]}>{elements.length} elements</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 8,
  },
  canvasWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  footerText: { fontSize: 13, fontWeight: '600', flex: 1 },
  footerMeta: { fontSize: 12 },
  missing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  missingText: { fontSize: 14 },
});
