import {
  serializeTemplate,
  parseTemplateMarkdown,
  templateSlug,
} from '../src/services/TemplateMarkdownService';
import type { NoteTemplate } from '../src/services/TemplateService';

const t: NoteTemplate = {
  id: 'custom-abc',
  name: 'Sprint Retro',
  icon: 'clipboard-outline',
  description: 'Retrospective notes',
  title: 'Retro - ',
  content: '## What went well\n- \n',
  tags: ['retro', 'team'],
  isCustom: true,
  createdAt: 1714780000000,
  updatedAt: 1714780000000,
};

describe('TemplateMarkdownService', () => {
  test('templateSlug produces a kebab-case filename stem', () => {
    expect(templateSlug('Sprint Retro')).toBe('sprint-retro');
    expect(templateSlug('  Hello / World!  ')).toBe('hello-world');
    expect(templateSlug('')).toBe('untitled');
  });

  test('serializeTemplate writes YAML frontmatter then body', () => {
    const md = serializeTemplate(t);
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('name: Sprint Retro');
    expect(md).toContain('icon: clipboard-outline');
    expect(md).toContain('tags: [retro, team]');
    expect(md).toContain("title: 'Retro - '");
    expect(md.endsWith('## What went well\n- \n')).toBe(true);
  });

  test('parseTemplateMarkdown round-trips serializeTemplate', () => {
    const md = serializeTemplate(t);
    const parsed = parseTemplateMarkdown('templates/sprint-retro.md', md);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe('custom-abc');
    expect(parsed!.name).toBe('Sprint Retro');
    expect(parsed!.icon).toBe('clipboard-outline');
    expect(parsed!.tags).toEqual(['retro', 'team']);
    expect(parsed!.title).toBe('Retro - ');
    expect(parsed!.content).toBe('## What went well\n- \n');
    expect(parsed!.filePath).toBe('templates/sprint-retro.md');
    expect(parsed!.isCustom).toBe(true);
  });

  test('parseTemplateMarkdown returns null when no frontmatter', () => {
    expect(parseTemplateMarkdown('templates/x.md', 'no frontmatter here')).toBeNull();
  });

  test('parseTemplateMarkdown derives id+name from filename when frontmatter omits them', () => {
    const md = '---\nicon: document-outline\n---\n\nhello\n';
    const parsed = parseTemplateMarkdown('templates/my-template.md', md);
    expect(parsed!.name).toBe('my template');
    expect(parsed!.id).toMatch(/^custom-/);
    expect(parsed!.content).toBe('hello\n');
  });
});
