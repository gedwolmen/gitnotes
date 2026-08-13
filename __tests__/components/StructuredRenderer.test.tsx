import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      text: '#000',
      primary: '#0066cc',
      textSecondary: '#666',
      surfaceSecondary: '#f0f0f0',
      border: '#ccc',
      background: '#fff',
      surface: '#fff',
      error: '#ff0000',
    },
  }),
}));

jest.mock('../../src/stores/renderStyleStore', () => ({
  useRenderStyle: () => ({}),
}));

import StructuredRenderer from '../../src/components/StructuredRenderer';
import type { NeorgContentBlock } from '../../src/models/NeorgContent';

function renderBlocks(blocks: NeorgContentBlock[], format: 'neorg' | 'org' = 'neorg') {
  return render(<StructuredRenderer blocks={blocks} format={format} />);
}

describe('StructuredRenderer', () => {
  test('renders heading', () => {
    const { getByText } = renderBlocks([
      { type: 'heading', heading: { level: 1, text: 'Hello World' } },
    ]);
    expect(getByText('Hello World')).toBeTruthy();
  });

  test('renders paragraph', () => {
    const { getByText } = renderBlocks([
      { type: 'paragraph', text: 'Some body text' },
    ]);
    expect(getByText('Some body text')).toBeTruthy();
  });

  test('renders code block', () => {
    const { getByText } = renderBlocks([
      { type: 'code', code: { language: 'js', content: 'const x = 1;' } },
    ]);
    expect(getByText('const x = 1;')).toBeTruthy();
  });

  test('renders list items', () => {
    const { getByText } = renderBlocks([
      { type: 'list', listItems: [
        { type: 'unordered', text: 'first', indentLevel: 0 },
        { type: 'unordered', text: 'second', indentLevel: 0 },
      ]},
    ]);
    expect(getByText('first')).toBeTruthy();
    expect(getByText('second')).toBeTruthy();
  });

  test('renders checklist items', () => {
    const { getByText } = renderBlocks([
      { type: 'checklist', checklistItems: [
        { text: 'done task', checked: true, indentLevel: 0 },
        { text: 'pending task', checked: false, indentLevel: 0 },
      ]},
    ]);
    expect(getByText('done task')).toBeTruthy();
    expect(getByText('pending task')).toBeTruthy();
  });

  test('renders definition items', () => {
    const { getByText } = renderBlocks([
      { type: 'definition', definitionItems: [
        { term: 'API', definition: 'Application Programming Interface', indentLevel: 0 },
      ]},
    ]);
    expect(getByText('API')).toBeTruthy();
    expect(getByText('Application Programming Interface')).toBeTruthy();
  });

  test('renders table', () => {
    const { getByText } = renderBlocks([
      { type: 'table', tableRows: [{ cells: ['Name', 'Age'] }, { cells: ['Alice', '30'] }], isHeaderRow: [true, false] },
    ]);
    expect(getByText('Name')).toBeTruthy();
    expect(getByText('Alice')).toBeTruthy();
  });

  test('renders quote block', () => {
    const { getByText } = renderBlocks([
      { type: 'quote', text: 'To be or not to be' },
    ]);
    expect(getByText('To be or not to be')).toBeTruthy();
  });

  test('renders divider', () => {
    const { toJSON } = renderBlocks([
      { type: 'divider' },
    ]);
    expect(toJSON()).toBeTruthy();
  });

  test('renders org heading with TODO badge', () => {
    const { getByText } = renderBlocks([
      { type: 'heading', heading: { level: 1, text: 'Task', todoState: 'TODO' } },
    ], 'org');
    expect(getByText('TODO')).toBeTruthy();
    expect(getByText('Task')).toBeTruthy();
  });

  test('renders org heading with priority badge', () => {
    const { getByText } = renderBlocks([
      { type: 'heading', heading: { level: 1, text: 'Urgent', priority: 'A' } },
    ], 'org');
    expect(getByText('#A')).toBeTruthy();
  });

  test('renders org heading with tags', () => {
    const { getByText } = renderBlocks([
      { type: 'heading', heading: { level: 1, text: 'Tagged', tags: ['work', 'home'] } },
    ], 'org');
    expect(getByText('work')).toBeTruthy();
    expect(getByText('home')).toBeTruthy();
  });

  test('renders org timestamp block', () => {
    const { getByText } = renderBlocks([
      { type: 'timestamp', timestamp: { type: 'scheduled', date: '2025-06-15' } },
    ]);
    expect(getByText(/SCHEDULED/)).toBeTruthy();
    expect(getByText(/2025-06-15/)).toBeTruthy();
  });

  test('renders org drawer/properties as null (internal org data)', () => {
    const { toJSON } = renderBlocks([
      { type: 'drawer', drawer: { name: 'PROPERTIES', properties: { CREATED: '[2025-01-01]' } } },
    ]);
    const rendered = toJSON();
    const hasText = rendered && rendered.children && rendered.children.length > 0;
    expect(hasText).toBeFalsy();
  });

  test('renders fixed-width block', () => {
    const { getByText } = renderBlocks([
      { type: 'fixed-width', text: 'monospace text' },
    ]);
    expect(getByText('monospace text')).toBeTruthy();
  });

  test('renders footnote block', () => {
    const { getByText } = renderBlocks([
      { type: 'footnote', footnote: { label: '1', content: 'A footnote definition.' } },
    ]);
    expect(getByText('[^1]')).toBeTruthy();
    expect(getByText('A footnote definition.')).toBeTruthy();
  });

  test('renders image with caption', () => {
    const { getByText } = renderBlocks([
      { type: 'image', image: { path: '/img/photo.png', caption: 'A photo' } },
    ]);
    expect(getByText('A photo')).toBeTruthy();
  });

  test('renders image without caption', () => {
    const { queryByText, toJSON } = renderBlocks([
      { type: 'image', image: { path: '/img/photo.png' } },
    ]);
    expect(queryByText('A photo')).toBeNull();
    expect(toJSON()).toBeTruthy();
  });

  test('renders math block via KatexView', () => {
    const { getByTestId } = renderBlocks([
      { type: 'math', math: { content: 'E = mc^2', inline: false } },
    ]);
    expect(getByTestId('katex-view.container')).toBeTruthy();
  });

  test('renders comment block as null', () => {
    const { toJSON } = renderBlocks([
      { type: 'comment' },
    ]);
    const container = toJSON() as any;
    const hasChildren = container.children && container.children.length > 0;
    expect(hasChildren).toBeFalsy();
  });

  test('org heading badges only show for org format', () => {
    const { queryByText } = renderBlocks([
      { type: 'heading', heading: { level: 1, text: 'Task', todoState: 'TODO' } },
    ], 'org');
    expect(queryByText('TODO')).toBeTruthy();
  });

  test('norg format does not show org badges', () => {
    const { queryByText } = renderBlocks([
      { type: 'heading', heading: { level: 1, text: 'Task', todoState: 'TODO' } },
    ], 'neorg');
    expect(queryByText('TODO')).toBeNull();
  });

  test('handles empty blocks array', () => {
    const { toJSON } = renderBlocks([]);
    expect(toJSON()).toBeTruthy();
  });

  test('handles null block gracefully', () => {
    const { toJSON } = renderBlocks([
      { type: 'heading' } as NeorgContentBlock,
    ]);
    expect(toJSON()).toBeTruthy();
  });

  test('renders deadline timestamp', () => {
    const { getByText } = renderBlocks([
      { type: 'timestamp', timestamp: { type: 'deadline', date: '2025-12-31' } },
    ]);
    expect(getByText(/DEADLINE/)).toBeTruthy();
  });

  test('renders closed timestamp', () => {
    const { getByText } = renderBlocks([
      { type: 'timestamp', timestamp: { type: 'closed', date: '2025-01-01' } },
    ]);
    expect(getByText(/CLOSED/)).toBeTruthy();
  });

  test('renders ordered list items with numbers', () => {
    const { getByText } = renderBlocks([
      { type: 'list', listItems: [
        { type: 'ordered', text: 'first', indentLevel: 0 },
        { type: 'ordered', text: 'second', indentLevel: 0 },
      ]},
    ]);
    expect(getByText(/1\./)).toBeTruthy();
    expect(getByText(/2\./)).toBeTruthy();
  });

  test('renders task list items with status icons', () => {
    const { getByText } = renderBlocks([
      { type: 'list', listItems: [
        { type: 'task', text: 'done task', status: 'done', indentLevel: 0 },
        { type: 'task', text: 'todo task', status: 'todo', indentLevel: 0 },
      ]},
    ]);
    expect(getByText(/done task/)).toBeTruthy();
    expect(getByText(/todo task/)).toBeTruthy();
  });
});
