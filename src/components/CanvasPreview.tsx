import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
  Image as SkiaImage,
  Text as SkiaText,
  matchFont,
} from '@shopify/react-native-skia';

import { useCanvases } from '../contexts/CanvasContext';
import { useTheme } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { CanvasChart, CanvasShape, CanvasStroke, CanvasText } from '../models/Canvas';
import { isImageElement } from '../models/Canvas';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface CanvasPreviewProps {
  canvasId: string;
}

function buildStrokePath(points: { x: number; y: number }[]) {
  if (points.length === 0) return null;
  const p = Skia.Path.Make();
  p.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    p.lineTo(points[i].x, points[i].y);
  }
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isPoint(point: unknown): point is { x: number; y: number } {
  return !!point
    && typeof point === 'object'
    && isFiniteNumber((point as { x?: unknown }).x)
    && isFiniteNumber((point as { y?: unknown }).y);
}

function isStrokeElement(el: unknown): el is CanvasStroke {
  return !!el
    && typeof el === 'object'
    && (el as { type?: unknown }).type === 'stroke'
    && Array.isArray((el as { points?: unknown }).points)
    && (el as { points: unknown[] }).points.every(isPoint)
    && isString((el as { color?: unknown }).color)
    && isFiniteNumber((el as { width?: unknown }).width)
    && isString((el as { tool?: unknown }).tool);
}

function isShapeElement(el: unknown): el is CanvasShape {
  return !!el
    && typeof el === 'object'
    && (el as { type?: unknown }).type === 'shape'
    && isString((el as { shape?: unknown }).shape)
    && isString((el as { color?: unknown }).color)
    && isFiniteNumber((el as { width?: unknown }).width)
    && isFiniteNumber((el as { x1?: unknown }).x1)
    && isFiniteNumber((el as { y1?: unknown }).y1)
    && isFiniteNumber((el as { x2?: unknown }).x2)
    && isFiniteNumber((el as { y2?: unknown }).y2)
    && ((el as { fillColor?: unknown }).fillColor === undefined || isString((el as { fillColor?: unknown }).fillColor));
}

function isTextElement(el: unknown): el is CanvasText {
  return !!el
    && typeof el === 'object'
    && (el as { type?: unknown }).type === 'text'
    && isString((el as { text?: unknown }).text)
    && isString((el as { color?: unknown }).color)
    && isFiniteNumber((el as { x?: unknown }).x)
    && isFiniteNumber((el as { y?: unknown }).y);
}

function isChartElement(el: unknown): el is CanvasChart {
  return !!el
    && typeof el === 'object'
    && (el as { type?: unknown }).type === 'chart'
    && isString((el as { chartType?: unknown }).chartType)
    && Array.isArray((el as { labels?: unknown }).labels)
    && (el as { labels: unknown[] }).labels.every(isString)
    && Array.isArray((el as { values?: unknown }).values)
    && (el as { values: unknown[] }).values.every(isFiniteNumber)
    && isFiniteNumber((el as { x?: unknown }).x)
    && isFiniteNumber((el as { y?: unknown }).y)
    && isFiniteNumber((el as { width?: unknown }).width)
    && isFiniteNumber((el as { height?: unknown }).height);
}

export default function CanvasPreview({ canvasId }: CanvasPreviewProps) {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { getCanvasById } = useCanvases();

  const canvasData = getCanvasById(canvasId);

  const font = useMemo(
    () =>
      matchFont({
        fontFamily: 'serif',
        fontSize: 20,
        fontWeight: 'normal' as const,
      }),
    [],
  );

  const handleOpen = () => {
    if (canvasData) {
      navigation.navigate('CanvasEditor', { canvasId: canvasData.id });
    }
  };

  if (!canvasData) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="easel-outline" size={20} color={colors.textSecondary} />
        <Text style={[styles.missingText, { color: colors.textSecondary }]}>
          Canvas not found
        </Text>
      </View>
    );
  }

  const scene = canvasData.scene;
  const elements: unknown[] = Array.isArray(scene?.elements) ? scene.elements : [];
  const sceneWidth = isFiniteNumber(scene?.width) && scene.width > 0 ? scene.width : 800;
  const sceneHeight = isFiniteNumber(scene?.height) && scene.height > 0 ? scene.height : 600;
  const previewWidth = Dimensions.get('window').width - 32;
  const previewHeight = 140;
  const scaleX = previewWidth / sceneWidth;
  const scaleY = previewHeight / sceneHeight;
  const scale = Math.min(scaleX, scaleY);

  const renderElement = (el: unknown, idx: number) => {
    if (isStrokeElement(el)) {
      const path = buildStrokePath(el.points);
      if (!path) return null;
      const strokeColor = el.tool === 'highlighter' ? hexToRgba(el.color, 0.3) : el.color;

      return (
        <Group key={el.id ?? idx}>
          <Path path={path} color={strokeColor} style="stroke" strokeWidth={el.width} strokeCap="round" strokeJoin="round" />
        </Group>
      );
    }

    if (isShapeElement(el)) {
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

    if (isTextElement(el)) {
      return <SkiaText key={el.id ?? idx} x={el.x} y={el.y} text={el.text} font={font} color={el.color} />;
    }

    if (isChartElement(el)) {
      const chartColors = ['#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE'];
      if (el.chartType === 'bar') {
        const maxVal = Math.max(...el.values, 1);
        const bw = Math.max(8, el.width / Math.max(1, el.values.length) - 4);
        return (
          <Group key={el.id ?? idx}>
            <Rect x={el.x} y={el.y} width={el.width} height={el.height} color="#f5f5f5" />
            {el.values.map((v, i) => (
              <Rect
                key={`bar-${el.id}-${v}-${el.labels[i]}`}
                x={el.x + i * (bw + 4) + 2}
                y={el.y + el.height - (v / maxVal) * el.height}
                width={bw}
                height={(v / maxVal) * el.height}
                color={chartColors[i % chartColors.length]}
              />
            ))}
          </Group>
        );
      }
      if (el.chartType === 'line') {
        const maxVal = Math.max(...el.values, 1);
        const linePath = Skia.Path.Make();
        el.values.forEach((v, i) => {
          const px = el.x + (i / Math.max(1, el.values.length - 1)) * el.width;
          const py = el.y + el.height - (v / maxVal) * el.height;
          if (i === 0) linePath.moveTo(px, py);
          else linePath.lineTo(px, py);
        });
        return (
          <Group key={el.id ?? idx}>
            <Rect x={el.x} y={el.y} width={el.width} height={el.height} color="#f5f5f5" />
            <Path path={linePath} color="#007AFF" style="stroke" strokeWidth={2} />
          </Group>
        );
      }
      if (el.chartType === 'pie') {
        const total = el.values.reduce((sum, v) => sum + v, 0) || 1;
        let acc = 0;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const r = Math.min(el.width, el.height) / 2;
        return (
          <Group key={el.id ?? idx}>
            {el.values.map((v, i) => {
              const startAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
              acc += v;
              const endAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
              const slicePath = Skia.Path.Make();
              slicePath.moveTo(cx, cy);
              slicePath.arcToOval(
                { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
                (startAngle * 180) / Math.PI,
                ((endAngle - startAngle) * 180) / Math.PI,
                false,
              );
              slicePath.close();
              return <Path key={`pie-${el.id}-${v}-${el.labels[i]}`} path={slicePath} color={chartColors[i % chartColors.length]} />;
            })}
          </Group>
        );
      }
    }

    if (isImageElement(el)) {
      try {
        const data = Skia.Data.fromBase64(el.data);
        const skImage = Skia.Image.MakeImageFromEncoded(data);
        if (skImage) {
          return (
            <SkiaImage
              key={el.id ?? idx}
              image={skImage}
              x={el.x}
              y={el.y}
              width={el.width}
              height={el.height}
              fit="fill"
            />
          );
        }
      } catch {
        // intentionally empty — fall through to placeholder rect
      }
      return <Rect key={el.id ?? idx} x={el.x} y={el.y} width={el.width} height={el.height} color="#CCCCCC" />;
    }

    return null;
  };

  return (
    <TouchableOpacity
      testID={`canvas-preview.button.open-${canvasId}`}
      onPress={handleOpen}
      activeOpacity={0.8}
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
        <Ionicons name="easel" size={14} color={colors.primary} />
        <Text style={[styles.footerText, { color: colors.primary }]}>
          {canvasData.title}
        </Text>
        <Text style={[styles.footerMeta, { color: colors.textSecondary }]}>
          {elements.length} elements
        </Text>
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
    height: 180,
  },
  canvasWrap: {
    flex: 1,
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
  footerText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  footerMeta: {
    fontSize: 12,
  },
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
  missingText: {
    fontSize: 14,
  },
});
