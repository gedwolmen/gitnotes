import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TextSearchBar } from './TextSearchBar';
import { searchText, navigateToMatch, MatchPosition } from '../utils/textSearch';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { UndoRedoButtons } from './UndoRedoButtons';
import { MarkdownToolbar } from './MarkdownToolbar';
import type { FormatAction, Selection } from '../utils/markdownFormatting';
import {
  addTab,
  insertLink,
  toggleBold,
  toggleChecklist,
  toggleCode,
  toggleHeading,
  toggleItalic,
  toggleList,
} from '../utils/markdownFormatting';
import { useHardWrap } from '../hooks/useHardWrap';

export type EditorMode = 'markdown' | 'raw';

function modifyLinePrefix(text: string, sel: Selection, pattern: RegExp, prefix: string): { text: string; selection: Selection } {
  let lineStart = sel.start;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  let lineEnd = sel.start;
  while (lineEnd < text.length && text[lineEnd] !== '\n') lineEnd++;
  const line = text.slice(lineStart, lineEnd);
  let newLine: string;
  if (pattern.test(line)) {
    newLine = line.replace(pattern, '');
  } else {
    newLine = prefix + line;
  }
  const newText = text.slice(0, lineStart) + newLine + text.slice(lineEnd);
  return { text: newText, selection: { start: sel.start, end: sel.end } };
}

interface MarkdownEditorProps {
  content: string;
  onContentChange: (text: string) => void;
  placeholder?: string;
  initialMode?: EditorMode;
  /**
   * testID applied directly to the inner TextInput (or raw textarea) so a
   * Maestro/XCUITest tap focuses the input rather than an outer wrapper view
   * that doesn't accept the focus action (#624).
   */
  inputTestID?: string;
  /**
   * Render the built-in MarkdownToolbar below the editor. Pass `false` when
   * the toolbar is being hosted externally (e.g. NoteEditorForm pins it to
   * the screen bottom so it doesn't scroll with the form).
   */
  showToolbar?: boolean;
}

/**
 * Imperative handle exposed via `forwardRef` so a parent (e.g. NoteEditorForm)
 * can move keyboard focus into the body editor without reaching into private
 * state — used to hop from title → body on the title's `onSubmitEditing`
 * (#628), since iOS doesn't reliably transfer focus from a tap on a multiline
 * TextInput while another sibling input is autofocused.
 */
export interface MarkdownEditorHandle {
  focus: () => void;
  /**
   * Apply a markdown formatting action against the current selection. The
   * built-in MarkdownToolbar already calls this internally; the imperative
   * handle exists so a parent (e.g. NoteEditorForm) can host a sticky
   * toolbar outside the editor's own layout.
   */
  applyFormat: (action: FormatAction) => void;
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({ content, onContentChange, placeholder = 'Start writing...', initialMode, inputTestID, showToolbar = true }, ref) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const handleFormatRef = useRef<(action: FormatAction) => void>(() => {});
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    applyFormat: (action) => handleFormatRef.current(action),
  }), []);
  const { text, setText, undo, redo, canUndo, canRedo, reset } = useUndoRedo(content);
  const previousTextRef = useRef(text);
  const prevPropContentRef = useRef(content);
  const { hardWrapEnabled, toggleHardWrap } = useHardWrap();
  const [cursor, setCursor] = useState<Selection>({ start: 0, end: 0 });
  const [mode, setMode] = useState<EditorMode>(() => initialMode ?? 'markdown');

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState<MatchPosition[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);

  useEffect(() => {
    if (previousTextRef.current === text) {
      return;
    }

    previousTextRef.current = text;
    onContentChange(text);
  }, [onContentChange, text]);

  useEffect(() => {
    if (content !== prevPropContentRef.current && content !== previousTextRef.current) {
      previousTextRef.current = content;
      prevPropContentRef.current = content;
      reset(content);
    }
    prevPropContentRef.current = content;
  }, [content, reset]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    const found = searchText(text, query);
    setMatches(found);
    setCurrentMatchIndex(0);
    if (found.length > 0) {
      setSelection({ start: found[0].start, end: found[0].end });
    } else {
      setSelection(undefined);
    }
  }, [text]);

  const handleNavigate = useCallback((index: number) => {
    if (matches.length === 0) return;
    const match = navigateToMatch(matches, index);
    const normalizedIndex = ((index % matches.length) + matches.length) % matches.length;
    setCurrentMatchIndex(normalizedIndex);
    setSelection({ start: match.start, end: match.end });
    inputRef.current?.focus();
  }, [matches]);

  const handleClose = useCallback(() => {
    setIsSearching(false);
    setSearchQuery('');
    setMatches([]);
    setCurrentMatchIndex(0);
    setSelection(undefined);
  }, []);

  const handleToggleSearch = useCallback(() => {
    if (isSearching) {
      handleClose();
    } else {
      setIsSearching(true);
    }
  }, [isSearching, handleClose]);

  const handleContentChange = useCallback((text: string) => {
    setText(text);
  }, [setText]);

  useEffect(() => {
    if (!isSearching || !searchQuery) {
      return;
    }

    const found = searchText(text, searchQuery);
    setMatches(found);

    if (found.length === 0) {
      setCurrentMatchIndex(0);
      setSelection(undefined);
      return;
    }

    const safeIndex = Math.min(currentMatchIndex, found.length - 1);
    setCurrentMatchIndex(safeIndex);
    setSelection({ start: found[safeIndex].start, end: found[safeIndex].end });
  }, [currentMatchIndex, isSearching, searchQuery, text]);

  const handleUndo = useCallback(() => {
    undo();
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

  const handleFormat = useCallback((action: FormatAction) => {
    const sel = { start: cursor.start, end: cursor.end };
    let result: { text: string; selection: Selection } | undefined;

    if (action.before === '**') result = toggleBold(text, sel);
    else if (action.before === '*' && action.type === 'wrap') result = toggleItalic(text, sel);
    else if (action.before === '`') result = toggleCode(text, sel);
    else if (action.before === '# ') result = toggleHeading(text, sel, 1);
    else if (action.before === '## ') result = toggleHeading(text, sel, 2);
    else if (action.before === '- ') result = toggleList(text, sel);
    else if (action.before === '1. ') result = modifyLinePrefix(text, sel, /^\d+\. /, '1. ');
    else if (action.before === '- [ ] ') result = toggleChecklist(text, sel);
    else if (action.before === '> ') result = modifyLinePrefix(text, sel, /^> /, '> ');
    else if (action.before === '[text](url)') result = insertLink(text, sel);
    else if (action.before === '  ') result = addTab(text, sel);

    if (result) setText(result.text);
  }, [cursor, text, setText]);

  handleFormatRef.current = handleFormat;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity testID="search-toggle" onPress={handleToggleSearch} hitSlop={8}>
          <Ionicons name={isSearching ? 'search' : 'search-outline'} size={20} color={isSearching ? colors.primary ?? colors.text : colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity testID="hardwrap-toggle" onPress={toggleHardWrap} hitSlop={8}>
          <Ionicons name="return-down-back" size={20} color={hardWrapEnabled ? (colors.primary ?? colors.text) : colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.modeSelector}>
          {(['markdown', 'raw'] as EditorMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              testID={`mode-${m}`}
              onPress={() => setMode(m)}
              style={[styles.modeButton, mode === m && styles.modeButtonActive]}
            >
              <Text style={[styles.modeButtonText, { color: mode === m ? colors.primary : colors.textSecondary }]}>
                {m === 'markdown' ? 'MD' : 'Raw'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.headerActions}>
          <UndoRedoButtons canUndo={canUndo} canRedo={canRedo} onUndo={handleUndo} onRedo={handleRedo} />
        </View>
      </View>

      {isSearching && (
        <TextSearchBar
          totalMatches={matches.length}
          currentIndex={currentMatchIndex}
          onSearch={handleSearch}
          onNavigate={handleNavigate}
          onClose={handleClose}
        />
      )}

      {mode === 'raw' ? (
        <TextInput
          testID={inputTestID ?? "raw-input"}
          style={[styles.editor, { color: colors.text, fontFamily: 'monospace' }]}
          value={text}
          onChangeText={handleContentChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          multiline
          textAlignVertical="top"
          autoCorrect={false}
          spellCheck={false}
        />
      ) : (
        <>
          <TextInput
            ref={inputRef}
            testID={inputTestID}
            style={[styles.editor, { color: colors.text }]}
            value={text}
            onChangeText={handleContentChange}
            placeholder={placeholder}
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
            autoCorrect
            spellCheck
            selection={selection}
            onSelectionChange={(e) => {
              const { start, end } = e.nativeEvent.selection;
              setCursor({ start, end });
              if (selection !== undefined) {
                setSelection(undefined);
              }
            }}
          />

          {showToolbar && (
            <View testID="markdown-editor.toolbar-action.press">
              <MarkdownToolbar onFormat={handleFormat} />
            </View>
          )}
        </>
      )}
    </View>
  );
});

export default MarkdownEditor;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 6,
    padding: 2,
  },
  modeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  modeButtonActive: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  editor: {
    fontSize: 16,
    padding: 16,
    lineHeight: 24,
    minHeight: 300,
    flex: 1,
  },
});
