import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Alert, View, Text, StyleSheet, ActivityIndicator, RefreshControl, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useNotes } from '../contexts/NoteContext';
import { useTheme } from '../contexts/ThemeContext';
import { useViewMode } from '../contexts/ViewModeContext';
import { useAuth } from '../contexts/AuthContext';
import { useRepos } from '../contexts/RepoContext';
import { RootStackParamList } from '../navigation/types';
import { Note } from '../models/Note';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GitHubService } from '../services/GitHubService';
import { NoteSyncQueueService } from '../services/NoteSyncQueueService';
import { pullAllFromRepos } from '../services/RepoPullService';
import ColorPicker from '../components/ColorPicker';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { ConflictBanner } from '../components/ui/ConflictBanner';
import { IconButton, ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { requireRepo } from '../utils/requireRepo';
import { HapticService } from '../utils/haptics';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { GitHubActivityIndicator } from '../components/GitHubActivityIndicator';
import { ViewMode, VIEW_MODE_ICONS } from '../utils/viewModes';
import { formatJournalDate } from '../services/JournalService';
import { NoteCard as NotesListCard } from '../components/notes/NoteCard';
import { NotesListHeader } from '../components/notes/NotesListHeader';
import { NotesViewModePicker } from '../components/notes/NotesViewModePicker';
import { NotesFilterModal } from '../components/notes/NotesFilterModal';
import { FilterBar, FilterChip } from '../components/FilterBar';
import { NotesEmptyState } from '../components/notes/NotesEmptyState';
import { NotesContextMenu } from '../components/notes/NotesContextMenu';
import { useNotesListFilters } from '../components/notes/useNotesListFilters';
import { useNotesListNoteActions } from '../components/notes/useNotesListNoteActions';
import { SwipeableListItem } from '../components/list/SwipeableListItem';
import { BulkActionBar } from '../components/list/BulkActionBar';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function NotesListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { authState } = useAuth();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const { viewMode, setViewMode } = useViewMode();
  const { isConnected } = useNetworkStatus();
  const { repositories } = useRepos();
  const {
    notes,
    filteredNotes,
    isLoading,
    searchQuery,
    setSearchQuery,
    deleteNote,
    refreshNotes,
    togglePin,
    error,
    createNote,
    updateNote,
  } = useNotes();

  const listRef = useRef<FlatList<Note>>(null);

  const [showViewModePicker, setShowViewModePicker] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [currentSearchMatchIndex, setCurrentSearchMatchIndex] = useState(0);
  const [pendingSync, setPendingSync] = useState(0);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [longPressedNote, setLongPressedNote] = useState<Note | null>(null);
  const [colorPickerNote, setColorPickerNote] = useState<Note | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const selectionMode = selectedIds.size > 0;

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const closeOpenSwipeable = useCallback(() => {}, []);

  const {
    filters,
    displayNotes,
    hasActiveSearch,
    searchMatchCount,
    activeFilterCount,
    allColors,
    allTags,
    allFolders,
    allBranches,
    sortMode,
    setSortMode,
    handleClearFilters,
    handleSelectRepo,
    handleSelectFormat,
    handleSelectBranch,
    handleSelectFolder,
    handleToggleTag,
    handleToggleColor,
  } = useNotesListFilters({ notes, filteredNotes, searchQuery });

  const activeFilterChips: FilterChip[] = useMemo(() => {
    const chips: FilterChip[] = [];
    if (filters.selectedFormat) {
      chips.push({ id: 'format', label: String(filters.selectedFormat), type: 'tag' });
    }
    if (filters.selectedBranch) {
      chips.push({ id: 'branch', label: filters.selectedBranch, type: 'folder' });
    }
    if (filters.selectedFolder) {
      chips.push({ id: 'folder', label: filters.selectedFolder, type: 'folder' });
    }
    for (const tag of filters.selectedTags) {
      chips.push({ id: `tag-${tag}`, label: tag, type: 'tag' });
    }
    for (const color of filters.selectedColors) {
      chips.push({ id: `color-${color}`, label: color, type: 'tag' });
    }
    return chips;
  }, [filters]);

  const handleRemoveFilterChip = useCallback(
    (id: string) => {
      if (id === 'format') handleSelectFormat(null);
      else if (id === 'branch') handleSelectBranch(null);
      else if (id === 'folder') handleSelectFolder(null);
      else if (id.startsWith('tag-')) handleToggleTag(id.slice(4));
      else if (id.startsWith('color-')) {
        const color = id.slice(6) as import('../models/Note').NoteColor;
        handleToggleColor(color);
      }
    },
    [handleSelectFormat, handleSelectBranch, handleSelectFolder, handleToggleTag, handleToggleColor],
  );

  const {
    handleNotePress,
    handleColorSelect,
    handleDeleteNote,
    handleDeleteFromSwipe,
    handleNoteLongPress,
    handleTogglePin,
    handleExport,
    handleOpenColorPicker,
    handleDuplicate,
  } = useNotesListNoteActions({
    navigation,
    isConnected,
    closeOpenSwipeable,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
    setLongPressedNote,
    setColorPickerNote,
    setIsDeleting,
  });

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (isDeletingRef.current) return;
    Alert.alert(
      `Delete ${ids.length} ${ids.length === 1 ? 'note' : 'notes'}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (isDeletingRef.current) return;
            isDeletingRef.current = true;
            setIsDeleting(true);
            try {
              for (const id of ids) {
                try {
                  await deleteNote(id);
                } catch (error) {
                  void error;
                }
              }
              HapticService.success();
              clearSelection();
            } finally {
              setIsDeleting(false);
              isDeletingRef.current = false;
            }
          },
        },
      ],
    );
  }, [selectedIds, deleteNote, clearSelection]);

  useEffect(() => {
    if (authState.token) GitHubService.setToken(authState.token);
  }, [authState.token]);

  useEffect(() => {
    let cancelled = false;
    const refreshPending = () => {
      NoteSyncQueueService.pendingCount().then((count) => {
        if (!cancelled) setPendingSync(count);
      });
    };
    refreshPending();
    const unsubscribe = NoteSyncQueueService.subscribe(refreshPending);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const ref = listRef.current;
    if (ref && typeof ref.scrollToOffset === 'function') {
      ref.scrollToOffset({ offset: 0, animated: false });
    }
  }, [filters.selectedRepo, filters.selectedBranch, filters.selectedFolder, filters.selectedFormat, filters.selectedTags, filters.selectedColors]);

  useEffect(() => {
    if (!hasActiveSearch || searchMatchCount === 0) {
      setCurrentSearchMatchIndex(0);
      return;
    }
    setCurrentSearchMatchIndex((previous) =>
      previous >= searchMatchCount ? searchMatchCount - 1 : previous,
    );
  }, [hasActiveSearch, searchMatchCount]);

  const handlePullToRefresh = useCallback(async () => {
    if (isPullRefreshing) return;
    setIsPullRefreshing(true);
    HapticService.light();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Sync timed out')), 60000);
    });
    try {
      await Promise.race([
        (async () => {
          await NoteSyncQueueService.drain();
          await pullAllFromRepos();
        })(),
        timeout,
      ]);
      await refreshNotes();
      HapticService.success();
    } catch (pullError) {
      HapticService.warning();
      console.warn('[Sync] pull-refresh failed:', pullError);
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      setIsPullRefreshing(false);
    }
  }, [isPullRefreshing, refreshNotes]);

  const handleManualSync = useCallback(async () => {
    if (isManualSyncing) return;
    HapticService.light();
    setIsManualSyncing(true);
    try {
      // Bidirectional: drain pending upserts AND pull remote changes (#621).
      // Mirrors handlePullToRefresh so the cloud icon and the swipe gesture
      // perform the same work — the icon previously only pushed, which left
      // remote ADD/UPDATE/DELETE invisible to users who tapped it expecting
      // a sync.
      await NoteSyncQueueService.drain();
      await pullAllFromRepos();
      await refreshNotes();
      HapticService.success();
    } catch (error) {
      HapticService.warning();
      console.warn('[Sync] manual sync failed:', error);
    } finally {
      setIsManualSyncing(false);
    }
  }, [isManualSyncing, refreshNotes]);

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      HapticService.selection();
      if (mode === 'graph') {
        navigation.navigate('GraphView');
      } else {
        setViewMode(mode);
      }
      setShowViewModePicker(false);
    },
    [navigation, setViewMode],
  );

  const scrollToSearchMatch = useCallback(
    (targetIndex: number) => {
      if (searchMatchCount === 0) return;
      const boundedIndex = ((targetIndex % searchMatchCount) + searchMatchCount) % searchMatchCount;
      setCurrentSearchMatchIndex(boundedIndex);
      listRef.current?.scrollToIndex({ index: boundedIndex, animated: true, viewPosition: 0.4 });
    },
    [searchMatchCount],
  );

  const handleSearchNavigate = useCallback(
    (step: -1 | 1) => {
      if (searchMatchCount === 0) return;
      scrollToSearchMatch(currentSearchMatchIndex + step);
    },
    [currentSearchMatchIndex, scrollToSearchMatch, searchMatchCount],
  );

  const handleTagPress = useCallback(
    (tag: string) => {
      handleToggleTag(tag);
      HapticService.light();
    },
    [handleToggleTag],
  );

  const renderNote = useCallback(
    ({ item, index }: { item: Note; index: number }) => {
      const prev = index > 0 ? displayNotes[index - 1] : undefined;
      const prevDateKey =
        viewMode === 'journal' && prev?.updatedAt ? formatJournalDate(new Date(prev.updatedAt)) : undefined;
      return (
        <SwipeableListItem
          itemId={item.id}
          selected={selectedIds.has(item.id)}
          selectionMode={selectionMode}
          onToggleSelect={() => toggleSelected(item.id)}
        >
          <NotesListCard
            note={item}
            viewMode={viewMode}
            onPress={handleNotePress}
            onLongPress={handleNoteLongPress}
            highlighted={hasActiveSearch && index === currentSearchMatchIndex}
            isOffline={isConnected === false}
            isCached={!!item.content?.trim()}
            onTagPress={handleTagPress}
            prevDateKey={prevDateKey}
            index={index}
          />
        </SwipeableListItem>
      );
    },
    [
      currentSearchMatchIndex,
      displayNotes,
      handleNoteLongPress,
      handleNotePress,
      handleTagPress,
      hasActiveSearch,
      isConnected,
      selectedIds,
      selectionMode,
      toggleSelected,
      viewMode,
    ],
  );

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: colors.background }]}>
      {isDeleting ? <GitHubActivityIndicator /> : null}
      <View style={{ flex: 1 }}>
      <View style={{ paddingTop: headerHeight }}>
        <OfflineBanner />
        <ConflictBanner />
      </View>

      <NotesListHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        repositories={repositories}
        selectedRepo={filters.selectedRepo}
        hasActiveSearch={hasActiveSearch}
        searchMatchCount={searchMatchCount}
        currentSearchMatchIndex={currentSearchMatchIndex}
        sortMode={sortMode}
        onSortChange={setSortMode}
        onSelectRepo={handleSelectRepo}
        onSearchNavigate={handleSearchNavigate}
      />

      <NotesViewModePicker
        visible={showViewModePicker}
        viewMode={viewMode}
        onClose={() => setShowViewModePicker(false)}
        onChange={handleViewModeChange}
      />

      <FilterBar
        filters={activeFilterChips}
        onRemoveFilter={handleRemoveFilterChip}
        onClearAll={handleClearFilters}
      />

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + '20', borderLeftColor: colors.error }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={displayNotes}
        renderItem={renderNote}
        keyExtractor={(item) => item.id}
        key={viewMode}
        extraData={displayNotes}
        removeClippedSubviews={false}
        contentContainerStyle={{ padding: 12, paddingTop: 4, paddingBottom: tabBarHeight + 16 }}
        refreshControl={
          <RefreshControl
            testID="notes-list.swipe.pull-refresh"
            refreshing={isPullRefreshing}
            onRefresh={handlePullToRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={<NotesEmptyState isFiltered={!!searchQuery || activeFilterCount > 0} />}
      />
      </View>

      <NotesFilterModal
        visible={showFilterModal}
        filters={filters}
        repositories={repositories}
        allBranches={allBranches}
        allFolders={allFolders}
        allTags={allTags}
        allColors={allColors}
        displayCount={displayNotes.length}
        activeFilterCount={activeFilterCount}
        onClose={() => setShowFilterModal(false)}
        onClearFilters={handleClearFilters}
        onSelectRepo={handleSelectRepo}
        onSelectFormat={handleSelectFormat}
        onSelectBranch={handleSelectBranch}
        onSelectFolder={handleSelectFolder}
        onToggleTag={handleToggleTag}
        onToggleColor={handleToggleColor}
      />

      <NotesContextMenu
        note={longPressedNote}
        visible={longPressedNote !== null}
        onClose={() => setLongPressedNote(null)}
        onOpen={handleNotePress}
        onTogglePin={handleTogglePin}
        onShare={handleExport}
        onPickColor={handleOpenColorPicker}
        onDuplicate={handleDuplicate}
        onDelete={async (note) => {
          await handleDeleteNote(note);
        }}
      />

      <ColorPicker
        visible={colorPickerNote !== null}
        onClose={() => setColorPickerNote(null)}
        selected={colorPickerNote?.color ?? null}
        onSelect={(color) => handleColorSelect(colorPickerNote, color)}
      />

      <BulkActionBar
        count={selectedIds.size}
        itemNoun="note"
        bottomOffset={tabBarHeight + 12}
        onCancel={clearSelection}
        onDelete={handleBulkDelete}
      />
      

      <ScreenHeader
        title="Notes"
        actions={
          <>
            <IconButton
              size="sm"
              testID="notes-list.icon-button.view-mode"
              onPress={() => {
                HapticService.light();
                setShowViewModePicker((previous) => !previous);
              }}
              accessibilityLabel="View mode"
            >
              <Ionicons name={VIEW_MODE_ICONS[viewMode]} size={18} color={colors.textSecondary} />
            </IconButton>
            <View style={styles.actionWithBadge}>
              <IconButton
                size="sm"
                testID="notes-list.icon-button.filters"
                active={activeFilterCount > 0}
                onPress={() => {
                  HapticService.light();
                  setShowFilterModal(true);
                }}
                accessibilityLabel="Filters"
              >
                <Ionicons
                  name="funnel-outline"
                  size={18}
                  color={activeFilterCount > 0 ? colors.accent : colors.textSecondary}
                />
              </IconButton>
              {activeFilterCount > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.actionWithBadge}>
              <IconButton
                size="sm"
                testID="notes-list.icon-button.sync"
                active={pendingSync > 0}
                disabled={isManualSyncing}
                onPress={handleManualSync}
                accessibilityLabel="Sync"
              >
                {isManualSyncing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons
                    name={pendingSync > 0 ? 'cloud-upload' : 'cloud-done'}
                    size={18}
                    color={pendingSync > 0 ? colors.accent : colors.textSecondary}
                  />
                )}
              </IconButton>
              {pendingSync > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>{pendingSync}</Text>
                </View>
              ) : null}
            </View>
            <IconButton
              size="sm"
              testID="notes-list.icon-button.add"
              onPress={() => {
                HapticService.medium();
                if (!requireRepo(repositories.length > 0, {
                  kind: 'note',
                  onOpenSettings: () => navigation.getParent()?.navigate('SettingsTab' as never),
                })) {
                  return;
                }
                navigation.navigate('NoteEditor', {});
              }}
              accessibilityLabel="Add note"
            >
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBanner: {
    marginHorizontal: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  errorText: { fontSize: 13 },
  actionWithBadge: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
