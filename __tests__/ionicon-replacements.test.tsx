import fs from 'fs';
import path from 'path';

const TARGET_FILES = [
  '../src/screens/CanvasEditorScreen.tsx',
  '../src/components/CanvasModal.tsx',
  '../src/components/NoteCard.tsx',
];

const RAW_UI_EMOJIS = ['✏️', '🖊', '🧹', '🗑', '☝️', '📂', '📁', '🌿'];

describe('ionicon replacements', () => {
  it('removes raw UI emoji from the canvas and note chrome', () => {
    for (const relPath of TARGET_FILES) {
      const filePath = path.join(__dirname, relPath);
      const content = fs.readFileSync(filePath, 'utf8');
      for (const emoji of RAW_UI_EMOJIS) {
        expect(content.includes(emoji)).toBe(false);
      }
    }
  });
});
