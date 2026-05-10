import { stripPreview } from '../../src/utils/notePreview';

describe('stripPreview (issue #661)', () => {
  describe('markdown', () => {
    test('strips heading hash', () => {
      expect(stripPreview('# Heading line', 'markdown')).toBe('Heading line');
    });

    test('strips checkbox markers', () => {
      expect(stripPreview('- [ ] open task', 'markdown')).toBe('open task');
      expect(stripPreview('- [x] done task', 'markdown')).toBe('done task');
      expect(stripPreview('- [X] also done', 'markdown')).toBe('also done');
    });

    test('strips heading + multiple checkboxes from a paragraph', () => {
      const out = stripPreview(
        '# Heading line\n- [ ] open task\n- [x] done task\ndocs',
        'markdown',
      );
      expect(out).toBe('Heading line open task done task docs');
    });

    test('strips bold/italic asterisks', () => {
      expect(stripPreview('a **bold** word', 'markdown')).toBe('a bold word');
      expect(stripPreview('an *italic* word', 'markdown')).toBe('an italic word');
    });

    test('untitled checkbox-only body becomes the task description', () => {
      expect(stripPreview('- [ ] Task description', 'markdown')).toBe('Task description');
    });
  });

  describe('org', () => {
    test('strips :PROPERTIES: ... :END: drawer', () => {
      const src = [
        '* Executive Summary',
        ':PROPERTIES:',
        ':CATEGORY: Research',
        ':REVIEWED: 2026-05-08',
        ':END:',
        'Three rival platforms in mid-market.',
      ].join('\n');
      const out = stripPreview(src, 'org');
      expect(out).not.toMatch(/PROPERTIES/);
      expect(out).not.toMatch(/CATEGORY/);
      expect(out).not.toMatch(/REVIEWED/);
      expect(out).not.toMatch(/END/);
      expect(out).toMatch(/Executive Summary/);
      expect(out).toMatch(/Three rival platforms/);
    });

    test('strips arbitrary drawer (LOGBOOK)', () => {
      const out = stripPreview(
        '* H\n:LOGBOOK:\nCLOCK: [2026-01-01]\n:END:\nbody',
        'org',
      );
      expect(out).not.toMatch(/LOGBOOK/);
      expect(out).not.toMatch(/CLOCK/);
      expect(out).toMatch(/body/);
    });

    test('strips slash italic delimiters', () => {
      const out = stripPreview(
        'They keep the brand /coherent/ across blog posts.',
        'org',
      );
      expect(out).toBe('They keep the brand coherent across blog posts.');
    });

    test('strips org star headings', () => {
      expect(stripPreview('** Why Pillars\nbody', 'org')).toBe('Why Pillars body');
    });
  });

  describe('neorg', () => {
    test('strips slash italic', () => {
      expect(stripPreview('say /hello/ there', 'neorg')).toBe('say hello there');
    });

    test('strips norg star headings (any level)', () => {
      expect(stripPreview('*** Why Pillars\nbody', 'neorg')).toBe('Why Pillars body');
    });

    test('strips @document.meta block', () => {
      const src = ['@document.meta', 'title: Foo', '@end', 'body text'].join('\n');
      expect(stripPreview(src, 'neorg')).toBe('body text');
    });
  });

  describe('shared', () => {
    test('collapses whitespace and trims', () => {
      expect(stripPreview('  a   b   c  ', 'markdown')).toBe('a b c');
    });

    test('returns empty string when content is empty', () => {
      expect(stripPreview('', 'markdown')).toBe('');
    });

    test('handles undefined format gracefully', () => {
      expect(stripPreview('plain text', undefined as any)).toBe('plain text');
    });
  });
});

describe('stripPreview fenced code + math (issue #671)', () => {
  test('strips a fenced code block entirely', () => {
    const src = [
      'Heading',
      'Inline works.',
      '```javascript',
      "console.log('hello')",
      'const x = 1;',
      '```',
      'After fence.',
    ].join('\n');
    const out = stripPreview(src, 'markdown');
    expect(out).not.toMatch(/```/);
    expect(out).not.toMatch(/console\.log/);
    expect(out).not.toMatch(/const x = 1/);
    expect(out).toMatch(/Heading/);
    expect(out).toMatch(/After fence/);
  });

  test('strips multiple fenced blocks', () => {
    const src = [
      'A',
      '```',
      'first block',
      '```',
      'B',
      '```py',
      'second',
      '```',
      'C',
    ].join('\n');
    const out = stripPreview(src, 'markdown');
    expect(out).toBe('A B C');
  });

  test('strips inline $math$', () => {
    expect(stripPreview('Inline: $E = mc^2$ in a sentence.', 'markdown')).toBe(
      'Inline: in a sentence.',
    );
  });

  test('strips $$block math$$', () => {
    const src = ['before', '$$', 'a + b = c', '$$', 'after'].join('\n');
    const out = stripPreview(src, 'markdown');
    expect(out).toMatch(/before/);
    expect(out).toMatch(/after/);
    expect(out).not.toMatch(/a \+ b/);
    expect(out).not.toMatch(/\$/);
  });

  test('strips multiple inline math segments on one line', () => {
    const src = 'when $a \\neq 0$, the equation $ax^2 + bx + c = 0$ has solutions.';
    const out = stripPreview(src, 'markdown');
    expect(out).toBe('when , the equation has solutions.');
  });

  test('does not gobble across paragraphs when $ is unbalanced', () => {
    const src = 'a $ orphan dollar\nnext line ok';
    const out = stripPreview(src, 'markdown');
    expect(out).toMatch(/orphan/);
    expect(out).toMatch(/next line ok/);
  });
});
