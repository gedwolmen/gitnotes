import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Canvas as SkiaCanvas,
  Path,
  Rect,
  Oval,
  RoundedRect,
  Fill,
  Group,
  Skia,
  Text as SkiaText,
  matchFont,
} from '@shopify/react-native-skia';

import { CanvasChart, CanvasScene, CanvasShape, CanvasStroke, CanvasText } from '../models/Canvas';

interface CanvasThumbnailProps {
  scene: CanvasScene | undefined;
  width: number;
  height: number;
  background?: string;
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

function buildStrokePath(points: { x: number; y: number }[]) {
  if (points.length === 0) return null;
  const p = Skia.Path.Make();
  p.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    p.lineTo(points[i].x, points[i].y);
  }
  return p;
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

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function CanvasThumbnail({ scene, width, height, background }: CanvasThumbnailProps) {
  const font = useMemo(
    () => matchFont({ fontFamily: 'serif', fontSize: 20, fontWeight: 'normal' as const }),
    [],
  );

  const elements: unknown[] = Array.isArray(scene?.elements) ? (scene as CanvasScene).elements : [];
  const sceneWidth = isFiniteNumber(scene?.width) && (scene as CanvasScene).width > 0 ? (scene as CanvasScene).width : 800;
  const sceneHeight = isFiniteNumber(scene?.height) && (scene as CanvasScene).height > 0 ? (scene as CanvasScene).height : 600;
  const scale = Math.min(width / sceneWidth, height / sceneHeight);
  const fillColor = background ?? scene?.background ?? '#FFFFFF';

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
      const { x1, y1, x2, y2, shape, color: sColor, fillColor: sFill, width: sw } = el;
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (shape === 'line') return <Path key={el.id ?? idx} path={buildLinePath(x1, y1, x2, y2)} style="stroke" strokeWidth={sw} color={sColor} />;
      if (shape === 'arrow') return <Path key={el.id ?? idx} path={buildArrowPath(x1, y1, x2, y2, sw)} style="stroke" strokeWidth={sw} color={sColor} />;
      if (shape === 'rect') return (
        <Group key={el.id ?? idx}>
          {sFill && <Rect x={minX} y={minY} width={w} height={h} color={sFill} />}
          <Rect x={minX} y={minY} width={w} height={h} style="stroke" strokeWidth={sw} color={sColor} />
        </Group>
      );
      if (shape === 'roundRect') return (
        <Group key={el.id ?? idx}>
          {sFill && <RoundedRect x={minX} y={minY} width={w} height={h} r={10} color={sFill} />}
          <RoundedRect x={minX} y={minY} width={w} height={h} r={10} style="stroke" strokeWidth={sw} color={sColor} />
        </Group>
      );
      if (shape === 'ellipse') return (
        <Group key={el.id ?? idx}>
          {sFill && <Oval x={minX} y={minY} width={w} height={h} color={sFill} />}
          <Oval x={minX} y={minY} width={w} height={h} style="stroke" strokeWidth={sw} color={sColor} />
        </Group>
      );
      if (shape === 'diamond') {
        const dp = buildDiamondPath(x1, y1, x2, y2);
        return (
          <Group key={el.id ?? idx}>
            {sFill && <Path path={dp} color={sFill} />}
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
    return null;
  };

  return (
    <View style={[styles.wrap, { width, height }]} pointerEvents="none">
      <SkiaCanvas style={{ width, height }}>
        <Fill color={fillColor} />
        <Group transform={[{ scale }]}>
          {elements.map(renderElement)}
        </Group>
      </SkiaCanvas>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
