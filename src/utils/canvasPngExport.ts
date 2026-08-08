import { Skia, type SkCanvas, type SkPaint } from '@shopify/react-native-skia';
import type { CanvasElement } from '../models/Canvas';
import { getCanvasContentBounds } from '../components/canvas/CanvasEditorContent';

const CHART_COLORS = ['#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE'];

function makePaint(color: string, style: 'fill' | 'stroke', strokeWidth = 1, alpha = 1): SkPaint {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setStyle(style === 'fill' ? 0 : 1); // PaintStyle.Fill=0, Stroke=1
  paint.setStrokeWidth(strokeWidth);
  paint.setStrokeCap(1); // StrokeCap.Round
  paint.setStrokeJoin(1); // StrokeJoin.Round
  paint.setAntiAlias(true);
  if (alpha < 1) paint.setAlphaf(alpha);
  return paint;
}

function drawStrokePath(canvas: SkCanvas, points: { x: number; y: number }[], color: string, width: number, alpha = 1): void {
  if (points.length < 2) return;
  const path = Skia.Path.Make();
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    path.lineTo(points[i].x, points[i].y);
  }
  const paint = makePaint(color, 'stroke', width, alpha);
  canvas.drawPath(path, paint);
}

function drawShape(canvas: SkCanvas, el: Extract<CanvasElement, { type: 'shape' }>): void {
  const { x1, y1, x2, y2, shape, color, fillColor, width: sw } = el;
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);

  if (shape === 'line') {
    const path = Skia.Path.Make();
    path.moveTo(x1, y1);
    path.lineTo(x2, y2);
    canvas.drawPath(path, makePaint(color, 'stroke', sw));
    return;
  }

  if (shape === 'arrow') {
    const path = Skia.Path.Make();
    path.moveTo(x1, y1);
    path.lineTo(x2, y2);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const hl = Math.max(12, sw * 4);
    path.moveTo(x2, y2);
    path.lineTo(x2 - hl * Math.cos(ang - 0.4), y2 - hl * Math.sin(ang - 0.4));
    path.moveTo(x2, y2);
    path.lineTo(x2 - hl * Math.cos(ang + 0.4), y2 - hl * Math.sin(ang + 0.4));
    canvas.drawPath(path, makePaint(color, 'stroke', sw));
    return;
  }

  const rect = Skia.XYWHRect(minX, minY, w, h);

  // Fill first, then stroke
  if (fillColor) {
    const fillPaint = makePaint(fillColor, 'fill');
    if (shape === 'rect') canvas.drawRect(rect, fillPaint);
    else if (shape === 'roundRect') {
      const rrect = { rect, rx: 10, ry: 10 };
      canvas.drawRRect(rrect, fillPaint);
    }
    else if (shape === 'ellipse') canvas.drawOval(rect, fillPaint);
    else if (shape === 'diamond') {
      const path = Skia.Path.Make();
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      path.moveTo(cx, y1);
      path.lineTo(x2, cy);
      path.lineTo(cx, y2);
      path.lineTo(x1, cy);
      path.close();
      canvas.drawPath(path, fillPaint);
    }
  }

  const strokePaint = makePaint(color, 'stroke', sw);
  if (shape === 'rect') canvas.drawRect(rect, strokePaint);
  else if (shape === 'roundRect') {
    const rrect = { rect, rx: 10, ry: 10 };
    canvas.drawRRect(rrect, strokePaint);
  }
  else if (shape === 'ellipse') canvas.drawOval(rect, strokePaint);
  else if (shape === 'diamond') {
    const path = Skia.Path.Make();
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    path.moveTo(cx, y1);
    path.lineTo(x2, cy);
    path.lineTo(cx, y2);
    path.lineTo(x1, cy);
    path.close();
    canvas.drawPath(path, strokePaint);
  }
}

function drawChart(canvas: SkCanvas, el: Extract<CanvasElement, { type: 'chart' }>): void {
  // Background
  canvas.drawRect(Skia.XYWHRect(el.x, el.y, el.width, el.height), makePaint('#f5f5f5', 'fill'));

  if (el.chartType === 'bar') {
    const maxVal = Math.max(...el.values, 1);
    const bw = Math.max(8, el.width / Math.max(1, el.values.length) - 4);
    el.values.forEach((v, i) => {
      const barH = (v / maxVal) * el.height;
      canvas.drawRect(
        Skia.XYWHRect(el.x + i * (bw + 4) + 2, el.y + el.height - barH, bw, barH),
        makePaint(CHART_COLORS[i % CHART_COLORS.length], 'fill'),
      );
    });
  } else if (el.chartType === 'line') {
    const maxVal = Math.max(...el.values, 1);
    const path = Skia.Path.Make();
    el.values.forEach((v, i) => {
      const px = el.x + (i / Math.max(1, el.values.length - 1)) * el.width;
      const py = el.y + el.height - (v / maxVal) * el.height;
      if (i === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    });
    canvas.drawPath(path, makePaint('#007AFF', 'stroke', 2));
  } else if (el.chartType === 'pie') {
    const total = el.values.reduce((sum, v) => sum + v, 0) || 1;
    let acc = 0;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const r = Math.min(el.width, el.height) / 2;
    el.values.forEach((v, i) => {
      const startAngle = (acc / total) * 360 - 90;
      acc += v;
      const sweepAngle = (v / total) * 360;
      const oval = Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2);
      canvas.drawArc(oval, startAngle, sweepAngle, true, makePaint(CHART_COLORS[i % CHART_COLORS.length], 'fill'));
    });
  }
}

/**
 * Renders a canvas scene to PNG bytes using an offscreen Skia surface.
 * Static rendering only — no animations, no selection highlights, no lasso overlays.
 * Returns null if no elements or if rendering fails.
 */
export async function renderSceneToPng(
  elements: CanvasElement[],
  _sceneWidth: number,
  _sceneHeight: number,
): Promise<Uint8Array | null> {
  if (elements.length === 0) return null;

  const bounds = getCanvasContentBounds(elements);
  if (!bounds) return null;

  const padding = 16;
  const paddedW = bounds.maxX - bounds.minX + padding * 2;
  const paddedH = bounds.maxY - bounds.minY + padding * 2;

  if (paddedW <= 0 || paddedH <= 0) return null;

  const outputScale = Math.min(2, 4096 / paddedW, 4096 / paddedH);
  const outW = Math.ceil(paddedW * outputScale);
  const outH = Math.ceil(paddedH * outputScale);

  try {
    const surface = Skia.Surface.MakeOffscreen(outW, outH);
    if (!surface) return null;

    try {
      const canvas = surface.getCanvas();

      // White background
      canvas.save();
      canvas.drawColor(Skia.Color('#FFFFFF'));

      // Scale and translate to content bounds
      canvas.scale(outputScale, outputScale);
      canvas.translate(-bounds.minX + padding, -bounds.minY + padding);

      // Render each element
      for (const el of elements) {
        switch (el.type) {
          case 'stroke':
            drawStrokePath(
              canvas,
              el.points,
              el.color,
              el.width,
              el.tool === 'highlighter' ? 0.3 : 1,
            );
            break;
          case 'shape':
            drawShape(canvas, el);
            break;
          case 'text': {
            const font = Skia.Font(undefined, el.fontSize);
            const paint = makePaint(el.color, 'fill');
            canvas.drawText(el.text, el.x, el.y, paint, font);
            break;
          }
          case 'chart':
            drawChart(canvas, el);
            break;
          case 'image': {
            try {
              const data = Skia.Data.fromBase64(el.data);
              const skImage = Skia.Image.MakeImageFromEncoded(data);
              if (skImage) {
                canvas.drawImage(skImage, el.x, el.y);
              }
            } catch {
              // Skip images that fail to decode — render gray placeholder
              canvas.drawRect(Skia.XYWHRect(el.x, el.y, el.width, el.height), makePaint('#CCCCCC', 'fill'));
              canvas.drawRect(Skia.XYWHRect(el.x, el.y, el.width, el.height), makePaint('#999999', 'stroke', 1));
            }
            break;
          }
        }
      }

      canvas.restore();

      // Encode to PNG bytes
      const image = surface.makeImageSnapshot();
      if (!image) return null;

      const bytes = image.encodeToBytes();
      return bytes;
    } finally {
      surface.dispose();
    }
  } catch {
    return null;
  }
}
