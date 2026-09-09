import { parseWikiLinks } from '../../src/utils/wikiLinksParser';

describe('parseWikiLinks', () => {
  // ─── Basic link ────────────────────────────────────────────────────────────

  test('parses basic wiki link [[note]]', () => {
    const links = parseWikiLinks('[[My Note]]');
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('My Note');
    expect(links[0].displayText).toBe('My Note');
    expect(links[0].blockAnchor).toBeUndefined();
  });

  // ─── Display text ──────────────────────────────────────────────────────────

  test('parses display text [[note|display]]', () => {
    const links = parseWikiLinks('[[My Note|Click here]]');
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('My Note');
    expect(links[0].displayText).toBe('Click here');
    expect(links[0].blockAnchor).toBeUndefined();
  });

  // ─── Heading anchor ────────────────────────────────────────────────────────

  test('parses heading anchor [[note#heading]]', () => {
    const links = parseWikiLinks('[[My Note#Heading]]');
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('My Note#Heading');
    expect(links[0].displayText).toBe('My Note#Heading');
    expect(links[0].blockAnchor).toBeUndefined();
  });

  test('parses heading anchor with display text', () => {
    const links = parseWikiLinks('[[My Note#Heading|Custom Text]]');
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('My Note#Heading');
    expect(links[0].displayText).toBe('Custom Text');
    expect(links[0].blockAnchor).toBeUndefined();
  });

  // ─── Block anchor ─────────────────────────────────────────────────────────

  test('parses block anchor [[note#^blockid]]', () => {
    const links = parseWikiLinks('[[My Note#^abc123]]');
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('My Note');
    expect(links[0].blockAnchor).toBe('abc123');
    expect(links[0].displayText).toBe('My Note');
  });

  test('parses block anchor with display text [[note#^blockid|display]]', () => {
    const links = parseWikiLinks('[[My Note#^abc123|Click here]]');
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('My Note');
    expect(links[0].blockAnchor).toBe('abc123');
    expect(links[0].displayText).toBe('Click here');
  });

  // ─── Heading + block anchor ───────────────────────────────────────────────

  test('parses heading plus block anchor [[note#heading#^blockid]]', () => {
    const links = parseWikiLinks('[[My Note#Heading#^abc123]]');
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('My Note#Heading');
    expect(links[0].blockAnchor).toBe('abc123');
    expect(links[0].displayText).toBe('My Note#Heading');
  });

  test('parses heading plus block anchor with display text', () => {
    const links = parseWikiLinks('[[My Note#Heading#^abc123|Custom Text]]');
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('My Note#Heading');
    expect(links[0].blockAnchor).toBe('abc123');
    expect(links[0].displayText).toBe('Custom Text');
  });

  // ─── Multiple links in one string ────────────────────────────────────────

  test('parses multiple links in one string', () => {
    const links = parseWikiLinks('First [[Note A]] then [[Note B#^block|Display]] and [[Note C#Heading]]');
    expect(links).toHaveLength(3);
    expect(links[0].target).toBe('Note A');
    expect(links[0].displayText).toBe('Note A');
    expect(links[1].target).toBe('Note B');
    expect(links[1].blockAnchor).toBe('block');
    expect(links[1].displayText).toBe('Display');
    expect(links[2].target).toBe('Note C#Heading');
    expect(links[2].blockAnchor).toBeUndefined();
  });

  // ─── Empty target ──────────────────────────────────────────────────────────

  test('returns empty array for empty target', () => {
    expect(parseWikiLinks('[[]]')).toHaveLength(0);
  });

  test('returns empty array for whitespace-only target', () => {
    expect(parseWikiLinks('[[   ]]')).toHaveLength(0);
  });

  // ─── Malformed input ───────────────────────────────────────────────────────

  test('ignores malformed input — unclosed bracket', () => {
    const links = parseWikiLinks('[[Note');
    expect(links).toHaveLength(0);
  });

  test('ignores malformed input — missing closing bracket', () => {
    const links = parseWikiLinks('[Note]]');
    expect(links).toHaveLength(0);
  });

  test('ignores single brackets — not a wiki link', () => {
    const links = parseWikiLinks('[Note]');
    expect(links).toHaveLength(0);
  });

  test('ignores wiki-link-like text without pipe separator', () => {
    const links = parseWikiLinks('[[Note|text1|text2]]');
    // Second pipe is treated as part of display text — greedy capture
    expect(links).toHaveLength(1);
    expect(links[0].displayText).toBe('text1|text2');
  });

  // ─── Code blocks are skipped ──────────────────────────────────────────────

  test('skips links inside fenced code blocks', () => {
    const input = 'Text before ```code [[Note A]] and [[Note B#^block]] ``` text after';
    const links = parseWikiLinks(input);
    expect(links).toHaveLength(0);
  });

  test('skips links inside triple-backtick block with language specifier', () => {
    const input = '```typescript\n[[Note A]]\n[[Note B#^id|display]]\n```';
    const links = parseWikiLinks(input);
    expect(links).toHaveLength(0);
  });

  test('unclosed code block marker toggles state correctly', () => {
    // Opening ``` without closing — links after it are skipped
    const input = '[[Note A]]\n```unclosed\n[[Note B#^block]]';
    const links = parseWikiLinks(input);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('Note A');
  });

  test('resumes parsing after code block closes', () => {
    const input = '```\n[[Skipped]]\n```\n[[Note A]]';
    const links = parseWikiLinks(input);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('Note A');
  });

  // ─── Escaped links ─────────────────────────────────────────────────────────

  test('ignores escaped wiki links', () => {
    const links = parseWikiLinks('\\[[Escaped Note]]');
    expect(links).toHaveLength(0);
  });

  // ─── startIndex / endIndex ─────────────────────────────────────────────────

  test('reports correct startIndex and endIndex', () => {
    const input = 'prefix [[Note]] suffix';
    const links = parseWikiLinks(input);
    expect(links).toHaveLength(1);
    expect(links[0].startIndex).toBe(7);
    expect(links[0].endIndex).toBe(19);
  });

  test('handles multiline string with multiple links', () => {
    const input = '[[Note A]]\n[[Note B#^block|Display]]\n[[Note C]]';
    const links = parseWikiLinks(input);
    expect(links).toHaveLength(3);
    expect(links[0].startIndex).toBe(0);
    expect(links[0].endIndex).toBe(12);
    expect(links[1].startIndex).toBe(13);
    expect(links[2].startIndex).toBe(44);
  });
});