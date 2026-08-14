import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useCanvases } from '../contexts/CanvasContext';
import { useTheme } from '../contexts/ThemeContext';
import { useRepos } from '../contexts/RepoContext';
import { RootStackParamList } from '../navigation/types';
import { Canvas } from '../models/Canvas';
import { useEntityLock } from '../hooks/useGitOpLock';
import SearchBar from '../components/SearchBar';
import { ScreenHeader, IconButton, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
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

interface CanvasRowProps {
  item: Canvas;
  onOpen: (id: string) => void;
  onDelete: (canvas: Canvas) => void;
}

function CanvasRow({ item, onOpen, onDelete }: CanvasRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lock = useEntityLock(item.id, { repo: item.repo, branch: item.branch, path: item.filePath });
  const locked = lock.locked;
  const elementCount = item.scene?.elements?.length ?? 0;
  const date = new Date(item.updatedAt);
  const dateStr = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={{ opacity: locked ? 0.45 : 1 }}>
      <TouchableOpacity
        testID="canvas-list.button.open"
        className="flex-row items-center p-3.5 rounded-md border mb-2.5"
        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
        onPress={locked ? undefined : () => onOpen(item.id)}
        activeOpacity={0.7}
      >
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <Ionicons name="easel-outline" size={18} color={colors.primary} />
            <Text className="text-base font-semibold flex-1" style={{ color: colors.text }} numberOfLines={1}>
              {item.title || t('canvases.untitled')}
            </Text>
          </View>
          <Text className="text-xs mb-1" style={{ color: colors.textSecondary }}>
            {elementCount} element{elementCount !== 1 ? 's' : ''} · {dateStr}
          </Text>
          {item.repo && (
            <View className="flex-row items-center gap-1 mt-1">
              <Ionicons name="git-branch-outline" size={12} color={colors.primary} />
              <Text className="text-xs font-medium" style={{ color: colors.primary }} numberOfLines={1}>
                {item.repo.split('/').pop()}{item.branch ? ` · ${item.branch}` : ''}
              </Text>
            </View>
          )}
          {item.tags.length > 0 && (
            <View className="flex-row gap-1.5 flex-wrap">
              {item.tags.slice(0, 3).map((tag) => (
                <View key={tag} className="px-2 py-0.5 rounded-sm" style={{ backgroundColor: colors.primary + '18' }}>
                  <Text className="text-xs font-medium" style={{ color: colors.primary }}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {locked ? (
          <ActivityIndicator size="small" testID="canvas-row.lock-spinner" color={colors.primary} />
        ) : (
          <TouchableOpacity
            testID="canvas-list.button.delete"
            className="p-3"
            onPress={() => onDelete(item)}
          >
            <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function CanvasListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
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
    ({ item }: { item: Canvas }) => (
      <CanvasRow item={item} onOpen={handleOpen} onDelete={handleDelete} />
    ),
    [handleOpen, handleDelete],
  );

  return (
    <SafeAreaView edges={['bottom']} className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="px-4 py-2" style={{ paddingTop: headerHeight + 8 }}>
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
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: tabBarHeight + 24 }}
        columnWrapperStyle={columnCount > 1 ? { gap: 8 } : undefined}
        ListEmptyComponent={
          <View className="items-center justify-center pt-15 px-6">
            <Ionicons name="easel-outline" size={48} color={colors.textSecondary} />
            <Text className="text-xl font-bold mt-4 mb-1.5" style={{ color: colors.text }}>{t('canvases.emptyTitle')}</Text>
            <Text className="text-base text-center mb-5" style={{ color: colors.textSecondary }}>
              {t('canvases.emptySubtitle')}
            </Text>
            <TouchableOpacity
              testID="canvas-list.button.create"
              className="px-6 py-3 rounded-sm"
              style={{ backgroundColor: colors.primary }}
              onPress={handleCreate}
            >
              <Text className="text-white text-base font-semibold">{t('canvases.createCanvas')}</Text>
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
          className="flex-1 justify-center items-center p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          accessible={false}
          onPress={() => setShowSizePicker(false)}
        >
          <View className="w-full rounded-lg p-5" style={{ backgroundColor: colors.surface }} onStartShouldSetResponder={() => true}>
            <Text className="text-lg font-bold text-center mb-3" style={{ color: colors.text }}>{t('canvases.newCanvas')}</Text>

            <TextInput
              testID="canvas-list.input.title"
              className="border rounded-sm px-3 py-2.5 text-base mb-3.5"
              style={{ backgroundColor: colors.background, color: colors.text, borderColor: colors.border }}
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
                  className="flex-row justify-between items-center py-3 px-4 rounded-sm border mb-2"
                  style={{ borderColor: colors.border }}
                  onPress={() => handlePickSize(dims.w, dims.h)}
                  activeOpacity={0.7}
                >
                  <Text className="text-base font-semibold" style={{ color: colors.text }}>{label}</Text>
                  <Text className="text-xs font-mono" style={{ color: colors.textSecondary }}>{dims.desc}</Text>
                </TouchableOpacity>
              );
            })}

            <Text className="text-xs font-semibold uppercase mt-2 mb-2" style={{ color: colors.textSecondary }}>{t('canvases.customSize')}</Text>
            <View className="flex-row items-center gap-2 mb-3">
              <TextInput
                testID="canvas-list.input.custom-width"
                className="flex-1 border rounded-sm px-3 py-2.5 text-base font-mono"
                style={{ backgroundColor: colors.background, color: colors.text, borderColor: colors.border }}
                value={customW}
                onChangeText={setCustomW}
                keyboardType="number-pad"
                placeholder={t('canvases.widthPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                maxLength={4}
              />
              <Text className="text-lg font-semibold" style={{ color: colors.textSecondary }}>×</Text>
              <TextInput
                testID="canvas-list.input.custom-height"
                className="flex-1 border rounded-sm px-3 py-2.5 text-base font-mono"
                style={{ backgroundColor: colors.background, color: colors.text, borderColor: colors.border }}
                value={customH}
                onChangeText={setCustomH}
                keyboardType="number-pad"
                placeholder={t('canvases.heightPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                maxLength={4}
              />
            </View>

            <TouchableOpacity
              className="py-3 rounded-sm items-center mb-2"
              style={{ backgroundColor: colors.primary }}
              onPress={handleCustomSize}
            >
              <Text className="text-white text-base font-semibold">{t('canvases.createCustom')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 rounded-sm border items-center"
              style={{ borderColor: colors.border }}
              onPress={() => setShowSizePicker(false)}
            >
              <Text className="text-base" style={{ color: colors.textSecondary }}>{t('common.cancel')}</Text>
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

