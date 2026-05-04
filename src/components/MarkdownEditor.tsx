import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
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
}

export default function MarkdownEditor({ content, onContentChange, placeholder = 'Start writing...' }: MarkdownEditorProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const { text, setText, undo, redo, canUndo, canRedo, reset } = useUndoRedo(content);
  const previousTextRef = useRef(text);
  const { hardWrapEnabled, toggleHardWrap } = useHardWrap();
  const [cursor, setCursor] = useState<Selection>({ start: 0, end: 0 });

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
    if (content !== text) {
      reset(content);
    }
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity testID="search-toggle" onPress={handleToggleSearch} hitSlop={8}>
          <Ionicons name={isSearching ? 'search' : 'search-outline'} size={20} color={isSearching ? colors.primary ?? colors.text : colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity testID="hardwrap-toggle" onPress={toggleHardWrap} hitSlop={8}>
          <Ionicons name="return-down-back" size={20} color={hardWrapEnabled ? (colors.primary ?? colors.text) : colors.textSecondary} />
        </TouchableOpacity>

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

      <TextInput
        ref={inputRef}
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

      <MarkdownToolbar onFormat={handleFormat} />
    </View>
  );
}

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
  editor: {
    fontSize: 16,
    padding: 16,
    lineHeight: 24,
    minHeight: 300,
    flex: 1,
  },
});
