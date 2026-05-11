import type { FormatAction } from './markdownFormatting';
import type { NoteFormat } from '../models/Note';

export type ToolbarButton = {
  label: string;
  action: FormatAction;
  testID: string;
};

/**
 * Per-format toolbar layouts.
 *
 * The toolbar previously hard-coded markdown syntax (`**bold**`, `# H1`)
 * even when the active note was `.org` or `.norg` — tapping H1 in an Org
 * note inserted `# ` instead of `* `. Each format now ships its own
 * button set so the inserted syntax matches the file extension.
 *
 * - `markdown` (.md): CommonMark / GFM.
 * - `org` (.org): Org-mode (`* heading`, `*bold*`, `/italic/`, `=code=`,
 *   `[[url][label]]`).
 * - `neorg` (.norg): Neorg (`* heading`, `*bold*`, `/italic/`, `` `code` ``,
 *   `{:url:}[label]`, `~` ordered list, `( )` checklist).
 */
const MD_BUTTONS: ToolbarButton[] = [
  { label: 'H1', action: { type: 'line', before: '# ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'H2', action: { type: 'line', before: '## ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'B', action: { type: 'wrap', before: '**', after: '**' }, testID: 'editor-toolbar.toolbar-action.bold' },
  { label: 'I', action: { type: 'wrap', before: '*', after: '*' }, testID: 'editor-toolbar.toolbar-action.italic' },
  { label: 'Link', action: { type: 'insert', before: '[text](url)' }, testID: 'editor-toolbar.toolbar-action.link' },
  { label: 'UL', action: { type: 'line', before: '- ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'OL', action: { type: 'line', before: '1. ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'Checklist', action: { type: 'line', before: '- [ ] ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'Code', action: { type: 'wrap', before: '`', after: '`' }, testID: 'editor-toolbar.toolbar-action.code' },
  { label: 'Quote', action: { type: 'line', before: '> ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'Tab', action: { type: 'insert', before: '  ' }, testID: 'editor-toolbar.toolbar-action.heading' },
];

const ORG_BUTTONS: ToolbarButton[] = [
  { label: 'H1', action: { type: 'line', before: '* ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'H2', action: { type: 'line', before: '** ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'B', action: { type: 'wrap', before: '*', after: '*' }, testID: 'editor-toolbar.toolbar-action.bold' },
  { label: 'I', action: { type: 'wrap', before: '/', after: '/' }, testID: 'editor-toolbar.toolbar-action.italic' },
  { label: 'Link', action: { type: 'insert', before: '[[url][label]]' }, testID: 'editor-toolbar.toolbar-action.link' },
  { label: 'UL', action: { type: 'line', before: '- ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'OL', action: { type: 'line', before: '1. ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'Checklist', action: { type: 'line', before: '- [ ] ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'Code', action: { type: 'wrap', before: '=', after: '=' }, testID: 'editor-toolbar.toolbar-action.code' },
  { label: 'Quote', action: { type: 'line', before: '> ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'Tab', action: { type: 'insert', before: '  ' }, testID: 'editor-toolbar.toolbar-action.heading' },
];

const NORG_BUTTONS: ToolbarButton[] = [
  { label: 'H1', action: { type: 'line', before: '* ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'H2', action: { type: 'line', before: '** ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'B', action: { type: 'wrap', before: '*', after: '*' }, testID: 'editor-toolbar.toolbar-action.bold' },
  { label: 'I', action: { type: 'wrap', before: '/', after: '/' }, testID: 'editor-toolbar.toolbar-action.italic' },
  { label: 'Link', action: { type: 'insert', before: '{:url:}[label]' }, testID: 'editor-toolbar.toolbar-action.link' },
  { label: 'UL', action: { type: 'line', before: '- ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'OL', action: { type: 'line', before: '~ ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'Checklist', action: { type: 'line', before: '- ( ) ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'Code', action: { type: 'wrap', before: '`', after: '`' }, testID: 'editor-toolbar.toolbar-action.code' },
  { label: 'Quote', action: { type: 'line', before: '> ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'Tab', action: { type: 'insert', before: '  ' }, testID: 'editor-toolbar.toolbar-action.heading' },
];

export function getToolbarButtons(format: NoteFormat | undefined): ToolbarButton[] {
  switch (format) {
    case 'org':
      return ORG_BUTTONS;
    case 'neorg':
      return NORG_BUTTONS;
    case 'markdown':
    default:
      return MD_BUTTONS;
  }
}
