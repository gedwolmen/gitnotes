import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useNotes } from '../contexts/NoteContext';
import { Note, NoteFormat } from '../models/Note';
import { parseRepoPath } from '../components/RepoFileBrowser';
import { HapticService } from '../utils/haptics';
import TemplateSelector from '../components/TemplateSelector';
import { NoteTemplate } from '../services/TemplateService';
import { useResponsive } from '../hooks/useResponsive';
import { NButton, NCard, NModal, NGroup, NGroupRow, NScreenHeader } from '../components/neumorphic';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type EditableNoteFormat = Exclude<NoteFormat, 'pdf'>;

const FORMAT_OPTIONS: { label: string; value: EditableNoteFormat; ext: string }[] = [
  { label: 'Markdown', value: 'markdown', ext: '.md' },
  { label: 'Org Mode', value: 'org', ext: '.org' },
  { label: 'Neorg', value: 'neorg', ext: '.norg' },
];

function stripFormatting(content: string, format?: NoteFormat): string {
  const stripTopMetadata = (raw: string): string => {
    if (format === 'neorg') {
      const trimmed = raw.trimStart();
      if (!trimmed.startsWith('@document.meta')) return raw;
      const lines = raw.split('\n');
      if (!lines[0]?.trim().startsWith('@document.meta')) return raw;
      const endIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '@end');
      if (endIndex === -1) return raw;
      return lines.slice(endIndex + 1).join('\n').trimStart();
    }

    if (format === 'org') {
      const lines = raw.split('\n');
      let i = 0;
      while (i < lines.length && /^\s*#\+[A-Za-z0-9_]+:\s*.*$/.test(lines[i])) {
        i++;
      }
      while (i < lines.length && lines[i].trim() === '') {
        i++;
      }
      return i > 0 ? lines.slice(i).join('\n') : raw;
    }

    const trimmed = raw.trimStart();
    if (!trimmed.startsWith('---\n')) return raw;
    const lines = trimmed.split('\n');
    if (lines[0] !== '---') return raw;
    const closingIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
    if (closingIndex === -1) return raw;
    return lines.slice(closingIndex + 1).join('\n').trimStart();
  };

  const normalized = stripTopMetadata(content);

  return normalized
    // Remove markdown headings
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    // Remove org headings
    .replace(/^\*{1,6}\s+/gm, '')
    // Remove neorg headings
    .replace(/^\*{1,6}\s+/gm, '')
    // Remove markdown links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove code blocks
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    // Remove blockquotes
    .replace(/^>\s*/gm, '')
    // Collapse whitespace/newlines
    .replace(/\s+/g, ' ')
    .trim();
}

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { notes } = useNotes();
  const { isTablet, maxContentWidth } = useResponsive();
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  const handleCreateNote = useCallback(() => {
    HapticService.medium();
    setShowFormatPicker(true);
  }, []);

  const handleSelectFormat = useCallback((format: EditableNoteFormat) => {
    setShowFormatPicker(false);
    navigation.navigate('NoteEditor', { format });
  }, [navigation]);

  const handleFormatPickerClose = useCallback(() => {
    setShowFormatPicker(false);
  }, []);

  const handleOpenTemplates = useCallback(() => {
    HapticService.medium();
    setShowTemplateSelector(true);
  }, []);

  const handleTemplateSelect = useCallback((template: NoteTemplate) => {
    setShowTemplateSelector(false);
    navigation.navigate('NoteEditor', {
      initialTitle: template.title ?? '',
      initialContent: template.content,
    });
  }, [navigation]);

  const openItem = useCallback(
    (note: Note) => () => {
      if (note.format === 'pdf' && note.repo && note.filePath) {
        const info = parseRepoPath(note.repo);
        if (info) {
          navigation.navigate('PdfViewer', {
            owner: info.owner,
            repo: info.repo,
            branch: note.branch,
            path: note.filePath,
            title: note.title,
          });
          return;
        }
      }
      navigation.navigate('NoteEditor', { noteId: note.id });
    },
    [navigation]
  );

  const recentLimit = isTablet ? 6 : 3;
  const recentNotes = notes.filter((n) => n.format !== 'pdf').slice(0, recentLimit);
  const recentDocuments = notes.filter((n) => n.format === 'pdf').slice(0, recentLimit);

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <NScreenHeader title="GitNotēs" subtitle="Your development notes, organized." />
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]} showsVerticalScrollIndicator={false}>
      <View style={{ gap: 12, marginBottom: 24 }}>
        <NButton
          variant="primary"
          fullWidth
          onPress={handleCreateNote}
          leadingIcon={<Ionicons name="add" size={22} color={colors.accent} />}
          label="Create New Note"
        />
        <NButton
          fullWidth
          onPress={handleOpenTemplates}
          leadingIcon={<Ionicons name="copy-outline" size={20} color={colors.text} />}
          label="From Template"
        />
        <NButton
          fullWidth
          onPress={() => navigation.navigate('CanvasList')}
          leadingIcon={<Ionicons name="easel-outline" size={20} color={colors.text} />}
          label="Canvases"
        />
      </View>

      {recentNotes.length > 0 && (
        <View style={{ marginTop: 8, marginBottom: 16 }}>
          <NGroup title="Recent Notes">
            {recentNotes.map((note) => (
              <NGroupRow
                key={note.id}
                onPress={openItem(note)}
                trailing={note.repo ? <Ionicons name="code-slash" size={14} color={colors.textSecondary} /> : undefined}
              >
                <Text style={[styles.recentNoteTitle, { color: colors.text }]} numberOfLines={1}>
                  {note.title || 'Untitled'}
                </Text>
                <Text style={[styles.recentNotePreview, { color: colors.textSecondary }]} numberOfLines={1}>
                  {stripFormatting(note.content, note.format).substring(0, 60) || 'No content'}
                </Text>
              </NGroupRow>
            ))}
          </NGroup>
        </View>
      )}

      {recentDocuments.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <NGroup title="Recent Documents">
            {recentDocuments.map((note) => (
              <NGroupRow
                key={note.id}
                onPress={openItem(note)}
                leading={<Ionicons name="document-text" size={22} color={colors.accent} />}
                trailing={note.repo ? <Ionicons name="code-slash" size={14} color={colors.textSecondary} /> : undefined}
              >
                <Text style={[styles.recentNoteTitle, { color: colors.text }]} numberOfLines={1}>
                  {note.title || (note.filePath ?? 'Document').split('/').pop()}
                </Text>
                <Text style={[styles.recentNotePreview, { color: colors.textSecondary }]} numberOfLines={1}>
                  {note.filePath ?? 'PDF'}
                </Text>
              </NGroupRow>
            ))}
          </NGroup>
        </View>
      )}

      <NModal visible={showFormatPicker} onRequestClose={handleFormatPickerClose} fullWidth>
        <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Note Format</Text>
        <View style={{ gap: 10 }}>
          {FORMAT_OPTIONS.map((option) => (
            <NCard
              key={option.value}
              onPress={() => handleSelectFormat(option.value)}
              padding={14}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.formatLabel, { color: colors.text }]}>{option.label}</Text>
                <Text style={[styles.formatExt, { color: colors.textSecondary }]}>{option.ext}</Text>
              </View>
            </NCard>
          ))}
        </View>
        <View style={{ marginTop: 12 }}>
          <NButton variant="ghost" fullWidth label="Cancel" onPress={handleFormatPickerClose} />
        </View>
      </NModal>

      <TemplateSelector
        visible={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        onSelect={handleTemplateSelect}
      />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 24,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  recentSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  recentNote: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  recentNoteContent: {
    flex: 1,
  },
  recentNoteTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  recentNotePreview: {
    fontSize: 13,
  },
  gitIndicator: {
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  formatOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  formatLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  formatExt: {
    fontSize: 14,
    fontFamily: 'monospace',
  },
  cancelButton: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
  },
  titleTablet: {
    fontSize: 40,
    marginBottom: 16,
  },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentNoteTablet: {
    width: '48%',
    marginHorizontal: 0,
  },
});
