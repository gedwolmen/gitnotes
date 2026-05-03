import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useNotes } from '../contexts/NoteContext';
import { useCanvases } from '../contexts/CanvasContext';
import { NoteFormat } from '../models/Note';
import { parseRepoPath } from '../utils/gitPathParser';
import { HapticService } from '../utils/haptics';
import TemplateSelector from '../components/TemplateSelector';
import { NoteTemplate } from '../services/TemplateService';
import { NoteFormatPreferenceService } from '../services/NoteFormatPreferenceService';
import { useResponsive } from '../hooks/useResponsive';
import { Button, Card, Modal, ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { BentoRecent } from '../components/home/BentoRecent';
import { QuickAccessShelf } from '../components/home/QuickAccessShelf';
import { buildPinnedFeed, buildRecentFeed, RecentItem } from '../utils/recentItems';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type EditableNoteFormat = Exclude<NoteFormat, 'pdf' | 'json'>;

const FORMAT_OPTIONS: { label: string; value: EditableNoteFormat; ext: string }[] = [
  { label: 'Markdown', value: 'markdown', ext: '.md' },
  { label: 'Org Mode', value: 'org', ext: '.org' },
  { label: 'Neorg', value: 'neorg', ext: '.norg' },
];

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { notes } = useNotes();
  const { canvases } = useCanvases();
  const { isTablet, maxContentWidth } = useResponsive();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [defaultFormat, setDefaultFormat] = useState<EditableNoteFormat | null>(null);
  const [rememberFormat, setRememberFormat] = useState<boolean>(false);
  const [pickerRemember, setPickerRemember] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const fmt = await NoteFormatPreferenceService.getDefaultFormat();
      const remember = await NoteFormatPreferenceService.getRememberPreference();
      setDefaultFormat(fmt);
      setRememberFormat(remember);
    })();
  }, []);

  const handleCreateNote = useCallback(() => {
    HapticService.medium();
    if (rememberFormat && defaultFormat) {
      navigation.navigate('NoteEditor', { format: defaultFormat });
      return;
    }
    setPickerRemember(false);
    setShowFormatPicker(true);
  }, [navigation, rememberFormat, defaultFormat]);

  const handleSelectFormat = useCallback(async (format: EditableNoteFormat) => {
    setShowFormatPicker(false);
    if (pickerRemember) {
      await NoteFormatPreferenceService.setDefaultFormat(format, true);
      setDefaultFormat(format);
      setRememberFormat(true);
    } else {
      await NoteFormatPreferenceService.setDefaultFormat(format, false);
      setDefaultFormat(format);
      setRememberFormat(false);
    }
    navigation.navigate('NoteEditor', { format });
  }, [navigation, pickerRemember]);

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

  const recentLimit = isTablet ? 12 : 7;
  const pinnedLimit = isTablet ? 12 : 6;
  const recentItems = buildRecentFeed(notes, canvases, { excludePinned: true, limit: recentLimit });
  const pinnedItems = buildPinnedFeed(notes, canvases, pinnedLimit);

  const handleOpenRecentItem = useCallback(
    (item: RecentItem) => {
      if (item.kind === 'canvas') {
        navigation.navigate('CanvasEditor', { canvasId: item.data.id });
        return;
      }
      const note = item.data;
      if (item.kind === 'document' && note.repo && note.filePath) {
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
    [navigation],
  );

  return (
    <SafeAreaView edges={[]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: headerHeight, paddingBottom: tabBarHeight + 20 }, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]} showsVerticalScrollIndicator={false}>
      <View style={styles.bentoGrid}>
        <Pressable
          onPress={handleCreateNote}
          onLongPress={() => {
            HapticService.medium();
            setPickerRemember(false);
            setShowFormatPicker(true);
          }}
          style={({ pressed }) => [
            styles.bentoHero,
            { backgroundColor: colors.primary, opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
          ]}
        >
          <Ionicons name="add" size={140} color="#FFFFFF" style={styles.bentoHeroDecor} />
          <View style={styles.bentoHeroBadge}>
            <Ionicons name="add" size={18} color={colors.primary} />
          </View>
          <View style={styles.bentoHeroContent}>
            <Text style={styles.bentoHeroTitle}>Create New Note</Text>
            <Text style={styles.bentoHeroSubtitle}>Start with a blank note</Text>
          </View>
        </Pressable>

        <View style={styles.bentoRow}>
          <Pressable
            onPress={handleOpenTemplates}
            style={({ pressed }) => [
              styles.bentoTile,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
            ]}
          >
            <View style={[styles.bentoTileBadge, { backgroundColor: colors.primary + '1F' }]}>
              <Ionicons name="copy-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.bentoTileContent}>
              <Text style={[styles.bentoTileTitle, { color: colors.text }]}>From Template</Text>
              <Text style={[styles.bentoTileSubtitle, { color: colors.textSecondary }]}>Quick start</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('CanvasList')}
            style={({ pressed }) => [
              styles.bentoTile,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
            ]}
          >
            <View style={[styles.bentoTileBadge, { backgroundColor: colors.accent + '1F' }]}>
              <Ionicons name="easel-outline" size={22} color={colors.accent} />
            </View>
            <View style={styles.bentoTileContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.bentoTileTitle, { color: colors.text }]}>Canvases</Text>
                <View style={{ backgroundColor: '#3B82F6', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 }}>
                  <Text style={{ color: '#ffffff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>BETA</Text>
                </View>
              </View>
              <Text style={[styles.bentoTileSubtitle, { color: colors.textSecondary }]}>Visual notes</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <QuickAccessShelf items={pinnedItems} onOpen={handleOpenRecentItem} />
      <BentoRecent items={recentItems} onOpen={handleOpenRecentItem} />

      <Modal visible={showFormatPicker} onRequestClose={handleFormatPickerClose} fullWidth>
        <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Note Format</Text>
        <View style={{ gap: 10 }}>
          {FORMAT_OPTIONS.map((option) => (
            <Card
              key={option.value}
              onPress={() => handleSelectFormat(option.value)}
              padding={14}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.formatLabel, { color: colors.text }]}>{option.label}</Text>
                <Text style={[styles.formatExt, { color: colors.textSecondary }]}>{option.ext}</Text>
              </View>
            </Card>
          ))}
        </View>
        <TouchableOpacity
          style={styles.rememberRow}
          onPress={() => setPickerRemember((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: pickerRemember }}
        >
          <Ionicons
            name={pickerRemember ? 'checkbox' : 'square-outline'}
            size={22}
            color={pickerRemember ? colors.accent : colors.textSecondary}
          />
          <Text style={[styles.rememberLabel, { color: colors.text }]}>Remember my choice</Text>
        </TouchableOpacity>
        <View style={{ marginTop: 12 }}>
          <Button variant="ghost" fullWidth label="Cancel" onPress={handleFormatPickerClose} />
        </View>
      </Modal>

      <TemplateSelector
        visible={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        onSelect={handleTemplateSelect}
      />
      </ScrollView>
      <ScreenHeader title="GitNotēs" subtitle="Your development notes, organized." />
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
  bentoGrid: {
    gap: 12,
    marginBottom: 24,
  },
  bentoHero: {
    height: 160,
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  bentoHeroDecor: {
    position: 'absolute',
    right: -28,
    top: -28,
    opacity: 0.18,
  },
  bentoHeroBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoHeroContent: {
    gap: 4,
  },
  bentoHeroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  bentoHeroSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
    opacity: 0.78,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bentoTile: {
    flex: 1,
    height: 130,
    borderRadius: 20,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'space-between',
  },
  bentoTileBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoTileContent: {
    gap: 2,
  },
  bentoTileTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  bentoTileSubtitle: {
    fontSize: 12,
    fontWeight: '500',
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
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  rememberLabel: {
    fontSize: 14,
  },
});
