import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.resolve(__dirname, '../../../src/components/canvas/CanvasEditorContent.tsx');

describe('CanvasEditorContent live drawing', () => {
  it('derives the active stroke path from gesture-updated points', () => {
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).not.toContain('const activeStrokePathBuilder = useSharedValue');
    expect(source).toContain('const element = activeDrawingElement.value;');
    expect(source).toContain('const points = element.points;');
    expect(source).toContain('for (let i = 1; i < points.length; i++)');
  });
});
