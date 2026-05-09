import React, { useMemo, type ReactNode } from 'react';
import { Alert, Linking, Text, View, type ImageStyle, type ScrollView, type TextStyle, type ViewStyle } from 'react-native';
import {
  ReactComponentRegistryProvider,
  Renderer,
  type MarkedStyles,
  type ReactComponentRegistry,
  type RendererInterface,
  useMarkdownWithComponents,
} from 'react-native-marked';
import { Image } from 'expo-image';

import CodeBlock from '../components/CodeBlock';
import ImageCaption from '../components/ImageCaption';
import KatexView from '../components/KatexView';
import { TableRenderer } from '../components/TableRenderer';
import { isCanvasLink, canvasIdFromLink } from '../models/Canvas';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { parseFrontmatter } from './frontmatterParser';
import { decodeHtmlEntities } from './htmlEntities';
import { classifyHref } from './linkClassifier';
import { parseMath, type MathSegment } from './mathParser';
import { parseTables, type TableSegment } from './tableParser';
import { parseWikiLinks, type WikiLink } from './wikiLinksParser';

const INLINE_MATH_TOKEN_PREFIX = 'GITNOTES_INLINE_MATH_TOKEN_';
const WIKI_LINK_TOKEN_PREFIX = 'GITNOTES_WIKI_LINK_TOKEN_';
const INLINE_TOKEN_PATTERN = /GITNOTES_(?:INLINE_MATH|WIKI_LINK)_TOKEN_\d+__/g;
const BLOCK_MATH_COMPONENT = 'MarkdownMath';
const TABLE_COMPONENT = 'MarkdownTable';

type InlineMathEmbed = MathSegment & { token: string };
type WikiLinkEmbed = WikiLink & { token: string };

type ProcessedMarkdown = {
  frontmatter: Record<string, unknown>;
  markdown: string;
  inlineMath: InlineMathEmbed[];
  blockMath: MathSegment[];
  wikiLinks: WikiLinkEmbed[];
  tables: TableSegment[];
};

interface CustomRendererDeps {
  colors: {
    primary: string;
    text: string;
    surfaceSecondary?: string;
  };
  isDark?: boolean;
  navigation?: {
    navigate: (screen: string, params: Record<string, unknown>) => void;
  };
  previewContent?: string;
  previewScrollRef?: React.RefObject<ScrollView | null>;
  CanvasPreview?: React.ComponentType<{ canvasId: string }>;
  approxLinePx?: number;
  currentNotePath?: string;
  onOpenNote?: (path: string, fragment?: string) => boolean;
  /**
   * Y-offset map populated as headings render via `onLayout`. The link handler
   * reads from it to scroll to the actual measured heading position instead of
   * the wildly inaccurate `lineIndex * approxLinePx` heuristic.
   */
  headingPositions?: { current: Map<string, number> };
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function flattenNodeText(input: string | ReactNode | ReactNode[]): string {
  if (input == null || typeof input === 'boolean') return '';
  if (typeof input === 'string') return input;
  if (typeof input === 'number') return String(input);
  if (Array.isArray(input)) return input.map(flattenNodeText).join('');
  if (typeof input === 'object' && 'props' in (input as object)) {
    const children = (input as { props?: { children?: ReactNode } }).props?.children;
    return flattenNodeText(children ?? '');
  }
  return '';
}

function splitFenceSections(markdown: string): Array<{ text: string; isCodeFence: boolean }> {
  const sections: Array<{ text: string; isCodeFence: boolean }> = [];
  const fencePattern = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g;
  let cursor = 0;
  let match: RegExpExecArray | null = fencePattern.exec(markdown);

  while (match !== null) {
    const startIndex = match.index + match[1].length;

    if (startIndex > cursor) {
      sections.push({ text: markdown.slice(cursor, startIndex), isCodeFence: false });
    }

    sections.push({ text: markdown.slice(startIndex, fencePattern.lastIndex), isCodeFence: true });
    cursor = fencePattern.lastIndex;
    match = fencePattern.exec(markdown);
  }

  if (cursor < markdown.length) {
    sections.push({ text: markdown.slice(cursor), isCodeFence: false });
  }

  return sections;
}

function replaceSegments<T extends { startIndex: number; endIndex: number }>(
  text: string,
  segments: T[],
  replacement: (segment: T, index: number) => string,
): string {
  return [...segments]
    .sort((left, right) => right.startIndex - left.startIndex)
    .reduce((output, segment, reverseIndex) => {
      const forwardIndex = segments.length - reverseIndex - 1;
      return `${output.slice(0, segment.startIndex)}${replacement(segment, forwardIndex)}${output.slice(segment.endIndex)}`;
    }, text);
}

function wikiTargetToHref(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:\/\/|mailto:|tel:|#)/i.test(trimmed)) return trimmed;
  if (/\.(md|norg|org|pdf|json)(#.*)?$/i.test(trimmed)) return trimmed;
  // `[[file#section]]` was producing `file#section.md` — break the
  // fragment off, suffix the path with `.md`, then re-attach.
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx >= 0) {
    return `${trimmed.slice(0, hashIdx)}.md${trimmed.slice(hashIdx)}`;
  }
  return `${trimmed}.md`;
}

function formatFrontmatterValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => formatFrontmatterValue(item)).join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

function processMarkdown(markdown: string): ProcessedMarkdown {
  const { frontmatter, body } = parseFrontmatter(markdown);
  const decodedBody = decodeHtmlEntities(body);
  const inlineMath: InlineMathEmbed[] = [];
  const blockMath: MathSegment[] = [];
  const wikiLinks: WikiLinkEmbed[] = [];
  const tables: TableSegment[] = [];

  const output = splitFenceSections(decodedBody)
    .map((section) => {
      if (section.isCodeFence) {
        return section.text;
      }

      // Render GFM task list items as checkbox glyphs. The marked parser
      // we use strips `[ ]` / `[x]` and emits a plain bullet — a checklist
      // ends up looking identical to a regular bullet list. Replacing the
      // brackets with ☐ / ☑ before parsing keeps a visible state marker
      // through the existing list_item path with no renderer override.
      let segmentText = section.text
        .replace(/^(\s*[-*]\s+)\[ \]\s+/gm, '$1☐ ')
        .replace(/^(\s*[-*]\s+)\[x\]\s+/gim, '$1☑ ');

      const tableOffset = tables.length;
      const parsedTables = parseTables(segmentText);
      tables.push(...parsedTables);
      segmentText = replaceSegments(segmentText, parsedTables, (_table, index) => `\n<${TABLE_COMPONENT} index={${tableOffset + index}} />\n`);

      const parsedMath = parseMath(segmentText);
      const parsedBlockMath = parsedMath.filter((segment) => segment.type === 'block');
      const parsedInlineMath = parsedMath.filter((segment) => segment.type === 'inline');

      const blockMathOffset = blockMath.length;
      blockMath.push(...parsedBlockMath);
      segmentText = replaceSegments(segmentText, parsedBlockMath, (_math, index) => `\n<${BLOCK_MATH_COMPONENT} index={${blockMathOffset + index}} />\n`);

      const inlineMathOffset = inlineMath.length;
      const inlineMathEmbeds = parsedInlineMath.map((segment, index) => ({
        ...segment,
        token: `${INLINE_MATH_TOKEN_PREFIX}${inlineMathOffset + index}__`,
      }));
      inlineMath.push(...inlineMathEmbeds);
      segmentText = replaceSegments(segmentText, parsedInlineMath, (_math, index) => inlineMathEmbeds[index]?.token ?? '');

      const wikiOffset = wikiLinks.length;
      const parsedWikiEmbeds = parseWikiLinks(segmentText).map((segment, index) => ({
        ...segment,
        token: `${WIKI_LINK_TOKEN_PREFIX}${wikiOffset + index}__`,
      }));
      wikiLinks.push(...parsedWikiEmbeds);
      segmentText = replaceSegments(segmentText, parsedWikiEmbeds, (_link, index) => parsedWikiEmbeds[index]?.token ?? '');

      return segmentText;
    })
    .join('');

  return { frontmatter, markdown: output, inlineMath, blockMath, wikiLinks, tables };
}

export class NotePreviewRenderer extends Renderer implements RendererInterface {
  private deps: CustomRendererDeps;
  private inlineMathEmbeds = new Map<string, InlineMathEmbed>();
  private wikiLinkEmbeds = new Map<string, WikiLinkEmbed>();

  constructor(deps: CustomRendererDeps) {
    super();
    this.deps = deps;
  }

  getColors() {
    return this.deps.colors;
  }

  isDarkMode() {
    return this.deps.isDark ?? false;
  }

  setInlineEmbeds(processed: Pick<ProcessedMarkdown, 'inlineMath' | 'wikiLinks'>) {
    this.inlineMathEmbeds = new Map(processed.inlineMath.map((segment) => [segment.token, segment]));
    this.wikiLinkEmbeds = new Map(processed.wikiLinks.map((segment) => [segment.token, segment]));
  }

  private renderCanvasFallback(id: string): ReactNode {
    return (
      <Text
        key={`canvas-fallback-${id}`}
        selectable
        style={{
          color: this.deps.colors.text,
          backgroundColor: this.deps.colors.surfaceSecondary ?? '#f0f0f0',
          borderRadius: 8,
          overflow: 'hidden',
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        Canvas preview unavailable
      </Text>
    );
  }

  private renderInlineSegments(text: string, styles?: TextStyle): ReactNode[] {
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null = INLINE_TOKEN_PATTERN.exec(text);

    while (match !== null) {
      const token = match[0];

      if (match.index > cursor) {
        nodes.push(
          <Text key={this.getKey()} selectable style={styles}>
            {text.slice(cursor, match.index)}
          </Text>,
        );
      }

      const mathSegment = this.inlineMathEmbeds.get(token);
      if (mathSegment) {
        nodes.push(
          <View key={this.getKey()} style={{ alignSelf: 'center' }}>
            <KatexView expression={mathSegment.content} displayMode="inline" isDark={this.isDarkMode()} />
          </View>,
        );
      }

      const wikiLink = this.wikiLinkEmbeds.get(token);
      if (wikiLink) {
        nodes.push(this.link(wikiLink.displayText, wikiTargetToHref(wikiLink.target), styles));
      }

      cursor = match.index + token.length;
      match = INLINE_TOKEN_PATTERN.exec(text);
    }

    if (cursor < text.length) {
      nodes.push(
        <Text key={this.getKey()} selectable style={styles}>
          {text.slice(cursor)}
        </Text>,
      );
    }

    return nodes.length > 0
      ? nodes
      : [
        <Text key={this.getKey()} selectable style={styles}>
          {text}
        </Text>,
      ];
  }

  heading(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    const node = super.heading(text, styles);
    const positions = this.deps.headingPositions;
    if (!positions) return node;
    const slug = slugifyHeading(flattenNodeText(text));
    if (!slug) return node;
    return (
      <View
        key={this.getKey()}
        onLayout={(event) => {
          positions.current.set(slug, event.nativeEvent.layout.y);
        }}
      >
        {node}
      </View>
    );
  }

  image(uri: string, alt?: string, _style?: ImageStyle): ReactNode {
    const isCanvas = /canvas-drawings\/canvas-/.test(uri) || /^canvas-/.test(alt ?? '');
    const pngUri = /\.json(\?|$)/i.test(uri) ? uri.split('?')[0].replace(/\.json$/i, '.png') : uri;
    const backgroundColor = isCanvas ? '#fff' : this.deps.colors.surfaceSecondary ?? '#f0f0f0';

    return (
      <View key={this.getKey()}>
        <Image
          source={{ uri: pngUri }}
          contentFit="contain"
          accessibilityLabel={alt || undefined}
          style={{ width: '100%', height: 240, borderRadius: 6, backgroundColor }}
        />
        <ImageCaption text={alt ?? ''} mode="inline" isDark={this.isDarkMode()} />
      </View>
    );
  }

  link(children: string | ReactNode[], href: string, styles?: TextStyle): ReactNode {
    if (isCanvasLink(href) && this.deps.CanvasPreview) {
      const id = canvasIdFromLink(href);
      return React.createElement(
        ErrorBoundary,
        { key: `canvas-boundary-${id}`, fallback: this.renderCanvasFallback(id) },
        React.createElement(this.deps.CanvasPreview, { key: id, canvasId: id }),
      );
    }

    const onPress = () => {
      if (!href) return;

      const openExternal = (target: string) => {
        Linking.openURL(target).catch(() => {
          Alert.alert("Can't open link", target);
        });
      };

      const classified = classifyHref(href, this.deps.currentNotePath);
      if (!classified) {
        Alert.alert("Can't open link", href);
        return;
      }

      if (classified.kind === 'note') {
        const opened = this.deps.onOpenNote?.(classified.target, classified.fragment) ?? false;
        if (!opened) {
          Alert.alert('Link target not found');
        }
        return;
      }

      if (classified.kind === 'anchor') {
        const slug = classified.target;
        const positions = this.deps.headingPositions?.current;
        let measuredY = positions?.get(slug);

        // The renderer's heading() override slugifies the rendered text.
        // The link href's classifyHref slugifies the URL fragment. They
        // *should* match, but if the heading rendered with extra inline
        // formatting (e.g. trailing whitespace from a soft break), look the
        // slug up against the source-derived ToC entries as a backup.
        if (measuredY == null && positions && this.deps.previewContent) {
          for (const line of this.deps.previewContent.split('\n')) {
            const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
            if (!match) continue;
            if (slugifyHeading(match[1]) !== slug) continue;
            for (const [storedSlug, y] of positions) {
              if (storedSlug === slug || storedSlug.includes(slug) || slug.includes(storedSlug)) {
                measuredY = y;
                break;
              }
            }
            break;
          }
        }

        if (measuredY != null && this.deps.previewScrollRef?.current) {
          this.deps.previewScrollRef.current.scrollTo({ y: measuredY, animated: true });
          return;
        }

        if (__DEV__ && positions) {
          console.warn(
            '[markdown anchor] no measured y for slug',
            JSON.stringify(slug),
            'known slugs:',
            JSON.stringify([...positions.keys()]),
          );
        }

        const targetLine = (this.deps.previewContent ?? '').split('\n').findIndex((line) => {
          const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
          if (!match) return false;
          return slugifyHeading(match[1]) === slug;
        });

        if (targetLine >= 0 && this.deps.previewScrollRef?.current) {
          this.deps.previewScrollRef.current.scrollTo({ y: targetLine * (this.deps.approxLinePx ?? 22), animated: true });
          return;
        }

        Alert.alert('Heading not found', `No heading matches #${slug} in this note.`);
        return;
      }

      openExternal(classified.target);
    };

    return (
      <Text
        key={this.getKey()}
        selectable
        style={[styles, { color: this.deps.colors.primary, textDecorationLine: 'underline' }]}
        onPress={onPress}
      >
        {children}
      </Text>
    );
  }

  text(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    if (typeof text === 'string' && INLINE_TOKEN_PATTERN.test(text)) {
      INLINE_TOKEN_PATTERN.lastIndex = 0;
      return (
        <View key={this.getKey()} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
          {this.renderInlineSegments(text, styles)}
        </View>
      );
    }

    INLINE_TOKEN_PATTERN.lastIndex = 0;
    return (
      <Text key={this.getKey()} selectable style={styles}>
        {text}
      </Text>
    );
  }

  codespan(text: string, styles?: TextStyle): ReactNode {
    return (
      <Text
        key={this.getKey()}
        selectable
        style={[
          {
            backgroundColor: this.deps.colors.surfaceSecondary ?? '#f0f0f0',
            paddingHorizontal: 4,
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 14,
            color: this.deps.colors.text,
          },
          styles,
        ]}
      >
        {text}
      </Text>
    );
  }

  code(text: string, language?: string, containerStyle?: ViewStyle): ReactNode {
    return (
      <View key={this.getKey()} style={containerStyle}>
        <CodeBlock code={text} language={language} isDark={this.isDarkMode()} />
      </View>
    );
  }
}

function FrontmatterBlock({ frontmatter, colors }: { frontmatter: Record<string, unknown>; colors: CustomRendererDeps['colors'] }) {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
        backgroundColor: colors.surfaceSecondary ?? '#f0f0f0',
      }}
    >
      <Text selectable style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>
        Frontmatter
      </Text>
      {entries.map(([key, value]) => (
        <Text key={key} selectable style={{ color: colors.text, lineHeight: 22 }}>
          <Text style={{ fontWeight: '600' }}>{key}: </Text>
          {formatFrontmatterValue(value)}
        </Text>
      ))}
    </View>
  );
}

function MarkdownPreviewNodes({ value, styles, renderer }: { value: string; styles: MarkedStyles; renderer: NotePreviewRenderer }) {
  const nodes = useMarkdownWithComponents(value, { styles, renderer });
  return <>{React.Children.toArray(nodes)}</>;
}

export function MarkdownPreviewContent({ value, styles, renderer }: { value: string; styles: MarkedStyles; renderer: NotePreviewRenderer }) {
  const processed = useMemo(() => processMarkdown(value), [value]);
  renderer.setInlineEmbeds(processed);

  const components = useMemo<ReactComponentRegistry>(
    () => ({
      [BLOCK_MATH_COMPONENT]: ({ props }) => {
        const segment = processed.blockMath[Number(props.index)];
        return segment ? <KatexView expression={segment.content} displayMode="block" isDark={renderer.isDarkMode()} /> : null;
      },
      [TABLE_COMPONENT]: ({ props }) => {
        const table = processed.tables[Number(props.index)];
        return table ? <TableRenderer headers={table.headers} aligns={table.aligns} rows={table.rows} isDark={renderer.isDarkMode()} /> : null;
      },
    }),
    [processed.blockMath, processed.tables, renderer],
  );

  return (
    <ReactComponentRegistryProvider components={components}>
      <>
        <FrontmatterBlock frontmatter={processed.frontmatter} colors={renderer.getColors()} />
        <MarkdownPreviewNodes value={processed.markdown} styles={styles} renderer={renderer} />
      </>
    </ReactComponentRegistryProvider>
  );
}
