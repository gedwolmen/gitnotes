import { CanvasElement, CanvasScene, CanvasStroke, CanvasShape, CanvasText, CanvasChart } from '../models/Canvas';

function strokeToSvgPath(stroke: CanvasStroke): string {
  if (!stroke.points || stroke.points.length === 0) return '';
  const parts: string[] = [];
  parts.push(`M ${stroke.points[0].x} ${stroke.points[0].y}`);
  for (let i = 1; i < stroke.points.length; i++) {
    parts.push(`L ${stroke.points[i].x} ${stroke.points[i].y}`);
  }
  return parts.join(' ');
}

function shapeToSvgElement(shape: CanvasShape): string {
  const minX = Math.min(shape.x1, shape.x2);
  const minY = Math.min(shape.y1, shape.y2);
  const width = Math.abs(shape.x2 - shape.x1);
  const height = Math.abs(shape.y2 - shape.y1);

  const fillAttr = shape.fillColor ? ` fill="${shape.fillColor}"` : ' fill="none"';
  const strokeAttr = ` stroke="${shape.color}" stroke-width="${shape.width}"`;

  switch (shape.shape) {
    case 'line': {
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}"${strokeAttr} stroke-linecap="round"/>`;
    }
    case 'arrow': {
      const ang = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
      const hl = Math.max(12, shape.width * 4);
      const ax1 = shape.x2 - hl * Math.cos(ang - 0.4);
      const ay1 = shape.y2 - hl * Math.sin(ang - 0.4);
      const ax2 = shape.x2 - hl * Math.cos(ang + 0.4);
      const ay2 = shape.y2 - hl * Math.sin(ang + 0.4);
      return `<g${strokeAttr} stroke-linecap="round">
        <line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}"/>
        <line x1="${shape.x2}" y1="${shape.y2}" x2="${ax1}" y2="${ay1}"/>
        <line x1="${shape.x2}" y1="${shape.y2}" x2="${ax2}" y2="${ay2}"/>
      </g>`;
    }
    case 'rect': {
      return `<rect x="${minX}" y="${minY}" width="${width}" height="${height}"${fillAttr}${strokeAttr}/>`;
    }
    case 'roundRect': {
      return `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" rx="10" ry="10"${fillAttr}${strokeAttr}/>`;
    }
    case 'ellipse': {
      const cx = (shape.x1 + shape.x2) / 2;
      const cy = (shape.y1 + shape.y2) / 2;
      const rx = width / 2;
      const ry = height / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${fillAttr}${strokeAttr}/>`;
    }
    case 'diamond': {
      const cx = (shape.x1 + shape.x2) / 2;
      const cy = (shape.y1 + shape.y2) / 2;
      const points = `${cx},${shape.y1} ${shape.x2},${cy} ${cx},${shape.y2} ${shape.x1},${cy}`;
      return `<polygon points="${points}"${fillAttr}${strokeAttr}/>`;
    }
    default:
      return '';
  }
}

function textToSvgElement(text: CanvasText): string {
  return `<text x="${text.x}" y="${text.y}" font-size="${text.fontSize}" fill="${text.color}">${escapeXml(text.text)}</text>`;
}

function chartToSvgElement(chart: CanvasChart): string {
  const chartColors = ['#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE'];
  let svg = `<g>`;

  if (chart.chartType === 'bar') {
    const maxVal = Math.max(...chart.values, 1);
    const bw = Math.max(8, chart.width / Math.max(1, chart.values.length) - 4);
    chart.values.forEach((v, i) => {
      const barHeight = (v / maxVal) * chart.height;
      const x = chart.x + i * (bw + 4) + 2;
      const y = chart.y + chart.height - barHeight;
      const color = chartColors[i % chartColors.length];
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${barHeight}" fill="${color}"/>`;
    });
  } else if (chart.chartType === 'line') {
    const maxVal = Math.max(...chart.values, 1);
    const points: string[] = [];
    chart.values.forEach((v, i) => {
      const px = chart.x + (i / Math.max(1, chart.values.length - 1)) * chart.width;
      const py = chart.y + chart.height - (v / maxVal) * chart.height;
      points.push(`${px},${py}`);
    });
    svg += `<polyline points="${points.join(' ')}" fill="none" stroke="#007AFF" stroke-width="2"/>`;
  } else if (chart.chartType === 'pie') {
    const total = chart.values.reduce((sum, v) => sum + v, 0) || 1;
    let acc = 0;
    const cx = chart.x + chart.width / 2;
    const cy = chart.y + chart.height / 2;
    const r = Math.min(chart.width, chart.height) / 2;
    chart.values.forEach((v, i) => {
      const startAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
      acc += v;
      const endAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
      const startRad = startAngle;
      const endRad = endAngle;
      const x1 = cx + r * Math.cos(startRad);
      const y1 = cy + r * Math.sin(startRad);
      const x2 = cx + r * Math.cos(endRad);
      const y2 = cy + r * Math.sin(endRad);
      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
      const color = chartColors[i % chartColors.length];
      svg += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color}"/>`;
    });
  }

  svg += '</g>';
  return svg;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function canvasSceneToSvg(scene: CanvasScene): string {
  const elements = scene.elements || [];
  const svgElements: string[] = [];

  elements.forEach((el) => {
    if (el.type === 'stroke') {
      const path = strokeToSvgPath(el);
      if (path) {
        const opacity = el.tool === 'highlighter' ? ' opacity="0.3"' : '';
        const strokeAttr = ` stroke="${el.color}" stroke-width="${el.width}" stroke-linecap="round" stroke-linejoin="round"`;
        svgElements.push(`<path d="${path}"${strokeAttr}${opacity} fill="none"/>`);
      }
    } else if (el.type === 'shape') {
      svgElements.push(shapeToSvgElement(el));
    } else if (el.type === 'text') {
      svgElements.push(textToSvgElement(el));
    } else if (el.type === 'chart') {
      svgElements.push(chartToSvgElement(el));
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}">
  <rect width="100%" height="100%" fill="${scene.background || '#FFFFFF'}"/>
  ${svgElements.join('\n  ')}
</svg>`;
}

export function canvasSceneToBase64(scene: CanvasScene): string {
  const svg = canvasSceneToSvg(scene);
  const base64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}