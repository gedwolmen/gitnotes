import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useCanvases } from '../contexts/CanvasContext';
import { useTheme } from '../contexts/ThemeContext';
import { useRepos } from '../contexts/RepoContext';
import { RootStackParamList } from '../navigation/types';
import { Canvas } from '../models/Canvas';
import SearchBar from '../components/SearchBar';
import { ScreenHeader, IconButton, useScreenHeaderHeight } from '../components/ui';
import { EntityFilterModal } from '../components/EntityFilterModal';
import { ActiveFilterStrip } from '../components/ActiveFilterStrip';
import { useEntityFilter } from '../hooks/useEntityFilter';
import { useResponsive } from '../hooks/useResponsive';
import { useTranslation } from 'react-i18next';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const CANVAS_PRESET_KEYS = ['canvases.presets.phone', 'canvases.presets.tablet', 'canvases.presets.landscape', 'canvases.presets.square', 'canvases.presets.a4'] as const;
const CANVAS_PRESET_DIMS: Record<(typeof CANVAS_PRESET_KEYS)[number], { w: number; h: number; desc: string }> = {
  'canvases.presets.phone': { w: 1080, h: 1920, desc: '1080 × 1920' },
  'canvases.presets.tablet': { w: 1536, h: 2048, desc: '1536 × 2048' },
  'canvases.presets.landscape': { w: 1920, h: 1080, desc: '1920 × 1080' },
  'canvases.presets.square': { w: 1024, h: 1024, desc: '1024 × 1024' },
  'canvases.presets.a4': { w: 794, h: 1123, desc: '794 × 1123' },
};

export default function CanvasListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const headerHeight = useScreenHeaderHeight();
  const { canvases, filteredCanvases, searchQuery, setSearchQuery, deleteCanvas, refreshCanvases } = useCanvases();
  const { repositories } = useRepos();
  const filter = useEntityFilter<Canvas>(canvases);
  const displayCanvases = useMemo(() => filter.applyFilters(filteredCanvases), [filter, filteredCanvases]);
  const { columnCount } = useResponsive('list');
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [customW, setCustomW] = useState('800');
  const [customH, setCustomH] = useState('600');
  const [canvasTitle, setCanvasTitle] = useState('');

  useFocusEffect(
    useCallback(() => {
      refreshCanvases();
    }, [refreshCanvases]),
  );

  const handleCreate = useCallback(() => {
    setCanvasTitle('');
    setCustomW('800');
    setCustomH('600');
    setShowSizePicker(true);
  }, []);

  const handlePickSize = useCallback(
    (w: number, h: number) => {
      setShowSizePicker(false);
      navigation.navigate('CanvasEditor', {
        canvasWidth: w,
        canvasHeight: h,
        canvasTitle: canvasTitle.trim() || undefined,
      });
    },
    [navigation, canvasTitle],
  );

  const handleCustomSize = useCallback(() => {
    const w = parseInt(customW, 10) || 800;
    const h = parseInt(customH, 10) || 600;
    handlePickSize(Math.max(100, Math.min(w, 4096)), Math.max(100, Math.min(h, 4096)));
  }, [customW, customH, handlePickSize]);

  const handleOpen = useCallback(
    (id: string) => {
      navigation.navigate('CanvasEditor', { canvasId: id });
    },
    [navigation],
  );

  const handleDelete = useCallback(
    (canvas: Canvas) => {
      Alert.alert(t('canvases.deleteConfirmTitle'), t('canvases.deleteConfirmBody', { title: canvas.title }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteCanvas(canvas.id),
        },
      ]);
    },
    [deleteCanvas, t],
  );

  const renderCanvas = useCallback(
    ({ item }: { item: Canvas }) => {
      const elementCount = item.scene?.elements?.length ?? 0;
      const date = new Date(item.updatedAt);
      const dateStr = date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      return (
        <TouchableOpacity
          testID="canvas-list.button.open"
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => handleOpen(item.id)}
          activeOpacity={0.7}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Ionicons name="easel-outline" size={18} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                {item.title || t('canvases.untitled')}
              </Text>
            </View>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              {elementCount} element{elementCount !== 1 ? 's' : ''} · {dateStr}
            </Text>
            {item.repo && (
              <View style={styles.repoBadge}>
                <Ionicons name="git-branch-outline" size={12} color={colors.primary} />
                <Text style={[styles.repoBadgeText, { color: colors.primary }]} numberOfLines={1}>
                  {item.repo.split('/').pop()}{item.branch ? ` · ${item.branch}` : ''}
                </Text>
              </View>
            )}
            {item.tags.length > 0 && (
              <View style={styles.tagRow}>
                {item.tags.slice(0, 3).map((tag) => (
                  <View key={tag} style={[styles.tagChip, { backgroundColor: colors.primary + '18' }]}>
                    <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <TouchableOpacity
            testID="canvas-list.button.delete"
            onPress={() => handleDelete(item)}
            style={styles.deleteBtn}
          >
            <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    },
    [colors, handleOpen, handleDelete, t],
  );

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.searchBarContainer, { paddingTop: headerHeight + 8 }]}>
        <SearchBar
          testID="canvas-list.search-bar.search"
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('canvases.searchPlaceholder')}
        />
      </View>

      <ActiveFilterStrip filter={filter} />

      <EntityFilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filter={filter}
        repositories={repositories}
      />

      <FlatList
        data={displayCanvases}
        keyExtractor={(item) => item.id}
        renderItem={renderCanvas}
        numColumns={columnCount}
        key={`canvases-${columnCount}`}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={columnCount > 1 ? { gap: 8 } : undefined}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="easel-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('canvases.emptyTitle')}</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {t('canvases.emptySubtitle')}
            </Text>
            <TouchableOpacity
              testID="canvas-list.button.create"
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={handleCreate}
            >
              <Text style={styles.emptyBtnText}>{t('canvases.createCanvas')}</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <Modal
        visible={showSizePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSizePicker(false)}
      >
        <TouchableOpacity
          testID="canvas-list.overlay.size-picker"
          style={styles.sizeOverlay}
          activeOpacity={1}
          accessible={false}
          onPress={() => setShowSizePicker(false)}
        >
          <View style={[styles.sizeModal, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.sizeTitle, { color: colors.text }]}>{t('canvases.newCanvas')}</Text>

            <TextInput
              testID="canvas-list.input.title"
              style={[styles.titleInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              value={canvasTitle}
              onChangeText={setCanvasTitle}
              placeholder={t('canvases.namePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="sentences"
              maxLength={60}
            />

            {CANVAS_PRESET_KEYS.map((key) => {
              const dims = CANVAS_PRESET_DIMS[key];
              const label = t(key);
              return (
                <TouchableOpacity
                  key={key}
                  testID={`canvas-list.button.pick-size-${label.toLowerCase()}`}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`${label}, ${dims.desc}`}
                  style={[styles.sizeOption, { borderColor: colors.border }]}
                  onPress={() => handlePickSize(dims.w, dims.h)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sizeLabel, { color: colors.text }]}>{label}</Text>
                  <Text style={[styles.sizeDesc, { color: colors.textSecondary }]}>{dims.desc}</Text>
                </TouchableOpacity>
              );
            })}

            <Text style={[styles.sizeSubtitle, { color: colors.textSecondary }]}>{t('canvases.customSize')}</Text>
            <View style={styles.customRow}>
              <TextInput
                testID="canvas-list.input.custom-width"
                style={[styles.customInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={customW}
                onChangeText={setCustomW}
                keyboardType="number-pad"
                placeholder={t('canvases.widthPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                maxLength={4}
              />
              <Text style={[styles.customX, { color: colors.textSecondary }]}>×</Text>
              <TextInput
                testID="canvas-list.input.custom-height"
                style={[styles.customInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={customH}
                onChangeText={setCustomH}
                keyboardType="number-pad"
                placeholder={t('canvases.heightPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                maxLength={4}
              />
            </View>

            <TouchableOpacity
              style={[styles.customBtn, { backgroundColor: colors.primary }]}
              onPress={handleCustomSize}
            >
              <Text style={styles.customBtnText}>{t('canvases.createCustom')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sizeCancel, { borderColor: colors.border }]}
              onPress={() => setShowSizePicker(false)}
            >
              <Text style={[styles.sizeCancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      <ScreenHeader
        title={t('canvases.title')}
        badge={t('common.beta')}
        actions={
          <>
            <IconButton
              size="sm"
              testID="canvas-list.icon-button.filters"
              active={filter.activeCount > 0}
              onPress={() => setShowFilterModal(true)}
              accessibilityLabel={t('common.filters')}
            >
              <Ionicons
                name="funnel-outline"
                size={18}
                color={filter.activeCount > 0 ? colors.accent : colors.textSecondary}
              />
            </IconButton>
            <IconButton size="sm" testID="canvas-list.icon-button.new-canvas" onPress={handleCreate} accessibilityLabel={t('canvases.newCanvasA11y')}>
              <Ionicons name="add" size={20} color={colors.accent} />
            </IconButton>
          </>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  cardMeta: {
    fontSize: 13,
    marginBottom: 4,
  },
  repoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  repoBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sizeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sizeModal: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
  },
  sizeTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 14,
  },
  sizeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  sizeLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  sizeDesc: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  sizeSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 8,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'monospace',
  },
  customX: {
    fontSize: 18,
    fontWeight: '600',
  },
  customBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  customBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sizeCancel: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  sizeCancelText: {
    fontSize: 15,
  },
});
