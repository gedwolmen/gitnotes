import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

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
import { ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { HapticService } from '../utils/haptics';
import { useResponsive } from '../hooks/useResponsive';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { GitHubActivityIndicator } from '../components/GitHubActivityIndicator';
import { ViewMode } from '../utils/viewModes';
import { NoteCard as NotesListCard } from '../components/notes/NoteCard';
import { NotesListHeader } from '../components/notes/NotesListHeader';
import { NotesViewModePicker } from '../components/notes/NotesViewModePicker';
import { NotesFilterModal } from '../components/notes/NotesFilterModal';
import { FilterBar, FilterChip } from '../components/FilterBar';
import { NotesEmptyState } from '../components/notes/NotesEmptyState';
import { NotesContextMenu } from '../components/notes/NotesContextMenu';
import { useNotesListFilters } from '../components/notes/useNotesListFilters';
import { useNotesListNoteActions } from '../components/notes/useNotesListNoteActions';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function NotesListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { authState } = useAuth();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const { viewMode, setViewMode } = useViewMode();
  const { isTablet, maxContentWidth } = useResponsive();
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

  const listRef = useRef<FlashListRef<Note>>(null);
  const swipeableRefs = useRef<Record<string, React.RefObject<SwipeableMethods | null>>>({});
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);

  const [showViewModePicker, setShowViewModePicker] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [currentSearchMatchIndex, setCurrentSearchMatchIndex] = useState(0);
  const [pendingSync, setPendingSync] = useState(0);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [longPressedNote, setLongPressedNote] = useState<Note | null>(null);
  const [colorPickerNote, setColorPickerNote] = useState<Note | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const closeOpenSwipeable = useCallback(() => {
    openSwipeableRef.current?.close();
    openSwipeableRef.current = null;
  }, []);

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

  const listToken = useMemo(() => {
    let h = displayNotes.length;
    for (let i = 0; i < displayNotes.length; i++) {
      const n = displayNotes[i];
      h = ((h * 31) + (n.isPinned ? 1 : 0) + i) | 0;
    }
    return h;
  }, [displayNotes]);

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
    handleShare,
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

  const getSwipeableRef = useCallback((noteId: string) => {
    if (!swipeableRefs.current[noteId]) {
      swipeableRefs.current[noteId] = React.createRef<SwipeableMethods>();
    }
    return swipeableRefs.current[noteId];
  }, []);

  const handleSwipeableWillOpen = useCallback((noteId: string) => {
    const swipeable = swipeableRefs.current[noteId]?.current;
    if (openSwipeableRef.current && openSwipeableRef.current !== swipeable) {
      openSwipeableRef.current.close();
    }
    if (swipeable) openSwipeableRef.current = swipeable;
  }, []);

  const handleSwipeableWillClose = useCallback((noteId: string) => {
    const swipeable = swipeableRefs.current[noteId]?.current;
    if (openSwipeableRef.current === swipeable) {
      openSwipeableRef.current = null;
    }
  }, []);

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
      const result = await NoteSyncQueueService.drain();
      if (result.succeeded > 0) await refreshNotes();
    } finally {
      setIsManualSyncing(false);
    }
  }, [isManualSyncing, refreshNotes]);

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      HapticService.selection();
      setViewMode(mode);
      setShowViewModePicker(false);
    },
    [setViewMode],
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
    ({ item, index }: { item: Note; index: number }) => (
      <NotesListCard
        note={item}
        viewMode={viewMode}
        swipeableRef={getSwipeableRef(item.id)}
        onSwipeableWillOpen={() => handleSwipeableWillOpen(item.id)}
        onSwipeableWillClose={() => handleSwipeableWillClose(item.id)}
        onDelete={() => handleDeleteFromSwipe(item)}
        onPress={handleNotePress}
        onLongPress={handleNoteLongPress}
        highlighted={hasActiveSearch && index === currentSearchMatchIndex}
        isOffline={isConnected === false}
        isCached={!!item.content?.trim()}
        onTagPress={handleTagPress}
      />
    ),
    [
      currentSearchMatchIndex,
      getSwipeableRef,
      handleDeleteFromSwipe,
      handleNoteLongPress,
      handleNotePress,
      handleSwipeableWillClose,
      handleSwipeableWillOpen,
      handleTagPress,
      hasActiveSearch,
      isConnected,
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
    <SafeAreaView
      edges={[]}
      style={[
        styles.container,
        { backgroundColor: colors.background },
        isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' },
      ]}
    >
      {isDeleting ? <GitHubActivityIndicator /> : null}
      <View style={{ paddingTop: headerHeight }}>
        <OfflineBanner />
      </View>

      <NotesListHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        activeFilterCount={activeFilterCount}
        pendingSync={pendingSync}
        isManualSyncing={isManualSyncing}
        repositories={repositories}
        selectedRepo={filters.selectedRepo}
        hasActiveSearch={hasActiveSearch}
        searchMatchCount={searchMatchCount}
        currentSearchMatchIndex={currentSearchMatchIndex}
        sortMode={sortMode}
        onSortChange={setSortMode}
        onToggleViewModePicker={() => setShowViewModePicker((previous) => !previous)}
        onOpenFilters={() => setShowFilterModal(true)}
        onManualSync={handleManualSync}
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

      <FlashList
        ref={listRef}
        data={displayNotes}
        renderItem={renderNote}
        keyExtractor={(item) => item.id}
        key={viewMode}
        extraData={listToken}
        numColumns={1}
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
        onShare={handleShare}
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
      <ScreenHeader title="Notes" />
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
});
