import { mergeFormatStyle, emptyFormatStyle } from '../src/types/RenderStyle';
import type { FormatRenderStyle } from '../src/types/RenderStyle';

describe('mergeFormatStyle — new token keys', () => {
  it('merges table tokens without losing existing keys', () => {
    const base: FormatRenderStyle = {
      h1: { color: '#ff0000' },
      table: { border: '#aaa', headerBg: '#eee' },
    };
    const override: FormatRenderStyle = { table: { headerBg: '#333', cellBg: '#fff' } };
    const result = mergeFormatStyle(base, override);
    expect(result.h1?.color).toBe('#ff0000');
    expect(result.table?.border).toBe('#aaa');
    expect(result.table?.headerBg).toBe('#333');
    expect(result.table?.cellBg).toBe('#fff');
  });

  it('merges math tokens', () => {
    const base: FormatRenderStyle = { math: { textColor: '#000', blockBg: '#f5f5f5' } };
    const override: FormatRenderStyle = { math: { blockBg: '#222' } };
    const result = mergeFormatStyle(base, override);
    expect(result.math?.textColor).toBe('#000');
    expect(result.math?.blockBg).toBe('#222');
  });

  it('merges frontmatter tokens', () => {
    const base: FormatRenderStyle = { frontmatter: { bg: '#eee', text: '#333', keyColor: '#00f' } };
    const override: FormatRenderStyle = { frontmatter: { keyColor: '#f00' } };
    const result = mergeFormatStyle(base, override);
    expect(result.frontmatter?.bg).toBe('#eee');
    expect(result.frontmatter?.text).toBe('#333');
    expect(result.frontmatter?.keyColor).toBe('#f00');
  });

  it('merges checkbox tokens', () => {
    const base: FormatRenderStyle = { checkbox: { checkedColor: '#0f0', uncheckedColor: '#999' } };
    const override: FormatRenderStyle = { checkbox: { strikethroughColor: '#aaa' } };
    const result = mergeFormatStyle(base, override);
    expect(result.checkbox?.checkedColor).toBe('#0f0');
    expect(result.checkbox?.uncheckedColor).toBe('#999');
    expect(result.checkbox?.strikethroughColor).toBe('#aaa');
  });

  it('merges imageCaption tokens', () => {
    const base: FormatRenderStyle = { imageCaption: { color: '#fff' } };
    const override: FormatRenderStyle = { imageCaption: { overlayBg: 'rgba(0,0,0,0.5)' } };
    const result = mergeFormatStyle(base, override);
    expect(result.imageCaption?.color).toBe('#fff');
    expect(result.imageCaption?.overlayBg).toBe('rgba(0,0,0,0.5)');
  });

  it('merges wikiLink tokens', () => {
    const base: FormatRenderStyle = { link: { color: '#00f' } };
    const override: FormatRenderStyle = { wikiLink: { color: '#0ff' } };
    const result = mergeFormatStyle(base, override);
    expect(result.link?.color).toBe('#00f');
    expect(result.wikiLink?.color).toBe('#0ff');
  });

  it('merges syntaxHighlight tokens', () => {
    const base: FormatRenderStyle = {
      syntaxHighlight: { keyword: '#569cd6', string: '#ce9178', comment: '#6a9955' },
    };
    const override: FormatRenderStyle = {
      syntaxHighlight: { number: '#b5cea8', function: '#dcdcaa' },
    };
    const result = mergeFormatStyle(base, override);
    expect(result.syntaxHighlight?.keyword).toBe('#569cd6');
    expect(result.syntaxHighlight?.string).toBe('#ce9178');
    expect(result.syntaxHighlight?.comment).toBe('#6a9955');
    expect(result.syntaxHighlight?.number).toBe('#b5cea8');
    expect(result.syntaxHighlight?.function).toBe('#dcdcaa');
  });

  it('does not lose existing non-new keys when merging new keys', () => {
    const base: FormatRenderStyle = {
      h1: { color: '#red' },
      body: { color: '#333' },
      codeBlock: { background: '#111', text: '#eee' },
      inlineCode: { background: '#222', text: '#fff' },
      link: { color: '#00f' },
      blockquote: { bar: '#0f0', text: '#555' },
      divider: { color: '#ccc' },
    };
    const override: FormatRenderStyle = {
      table: { border: '#ddd' },
      math: { textColor: '#000' },
    };
    const result = mergeFormatStyle(base, override);
    expect(result.h1?.color).toBe('#red');
    expect(result.body?.color).toBe('#333');
    expect(result.codeBlock?.background).toBe('#111');
    expect(result.codeBlock?.text).toBe('#eee');
    expect(result.inlineCode?.background).toBe('#222');
    expect(result.link?.color).toBe('#00f');
    expect(result.blockquote?.bar).toBe('#0f0');
    expect(result.divider?.color).toBe('#ccc');
    expect(result.table?.border).toBe('#ddd');
    expect(result.math?.textColor).toBe('#000');
  });

  it('returns base unchanged when no override provided', () => {
    const base: FormatRenderStyle = {
      table: { border: '#aaa' },
      syntaxHighlight: { keyword: '#blue' },
    };
    const result = mergeFormatStyle(base, undefined);
    expect(result).toBe(base);
  });

  it('emptyFormatStyle returns object with no new keys set', () => {
    const empty = emptyFormatStyle();
    expect(empty.table).toBeUndefined();
    expect(empty.math).toBeUndefined();
    expect(empty.frontmatter).toBeUndefined();
    expect(empty.checkbox).toBeUndefined();
    expect(empty.imageCaption).toBeUndefined();
    expect(empty.wikiLink).toBeUndefined();
    expect(empty.syntaxHighlight).toBeUndefined();
  });
});
