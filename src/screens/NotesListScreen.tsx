import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Modal,
  ScrollView,
  RefreshControl,
} from "react-native";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { useNotes } from "../contexts/NoteContext";
import { useTheme } from "../contexts/ThemeContext";
import { useViewMode } from "../contexts/ViewModeContext";
import { useAuth } from "../contexts/AuthContext";
import { useRepos } from "../contexts/RepoContext";
import { RootStackParamList } from "../navigation/types";
import { Note, NoteFormat } from "../models/Note";
import { SafeAreaView } from "react-native-safe-area-context";
import { GitRepository } from "../services/GitService";
import { GitHubService } from "../services/GitHubService";
import { NoteSyncQueueService } from "../services/NoteSyncQueueService";
import { pullAllFromRepos } from "../services/RepoPullService";
import ContextMenu from "../components/ContextMenu";
import NoteCard from "../components/NoteCard";
import SearchBar from "../components/SearchBar";
import { NScreenHeader } from "../components/neumorphic";
import { parseRepoPath } from "../utils/gitPathParser";
import { HapticService } from "../utils/haptics";
import {
  ViewMode,
  VIEW_MODE_LABELS,
  VIEW_MODE_ICONS,
} from "../utils/viewModes";
import { ShareService } from "../services/ShareService";
import { useResponsive } from "../hooks/useResponsive";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const FORMAT_LABELS: Record<NoteFormat, string> = {
  markdown: ".md",
  neorg: ".norg",
  org: ".org",
  pdf: ".pdf",
};

export default function NotesListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { authState } = useAuth();
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
  } = useNotes();
  const { viewMode, setViewMode } = useViewMode();
  const { isTablet, columns, maxContentWidth } = useResponsive();
  const { repositories } = useRepos();
  const listRef = useRef<FlashListRef<Note>>(null);

  useEffect(() => {
    if (authState.token) {
      GitHubService.setToken(authState.token);
    }
  }, [authState.token]);

  const [showViewModePicker, setShowViewModePicker] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [currentSearchMatchIndex, setCurrentSearchMatchIndex] = useState(0);
  const [pendingSync, setPendingSync] = useState(0);
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      NoteSyncQueueService.pendingCount().then((n) => {
        if (!cancelled) setPendingSync(n);
      });
    };
    refresh();
    const unsub = NoteSyncQueueService.subscribe(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const handleManualSync = useCallback(async () => {
    if (isManualSyncing) return;
    HapticService.light();
    setIsManualSyncing(true);
    try {
      const result = await NoteSyncQueueService.drain();
      if (result.succeeded > 0) {
        await refreshNotes();
      }
    } finally {
      setIsManualSyncing(false);
    }
  }, [isManualSyncing, refreshNotes]);

  // Filters
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<NoteFormat | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((note) => {
      note.tags?.forEach((tag) => {
        tagSet.add(tag);
      });
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  const allFolders = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((note) => {
      const fp = note.folderPath?.trim();
      if (!fp) return;
      const parts = fp.split('/').filter(Boolean);
      let acc = '';
      for (const seg of parts) {
        acc = acc ? `${acc}/${seg}` : (fp.startsWith('/') ? `/${seg}` : seg);
        set.add(acc);
      }
      set.add(fp);
    });
    return Array.from(set).sort();
  }, [notes]);

  const activeFilterCount =
    (selectedRepo ? 1 : 0) +
    (selectedFolder ? 1 : 0) +
    (selectedFormat ? 1 : 0) +
    (selectedTags.length > 0 ? 1 : 0);

  const displayNotes = useMemo(() => {
    let result = filteredNotes;
    if (selectedFolder) {
      const sel = selectedFolder;
      result = result.filter((n: Note) => {
        const fp = n.folderPath;
        if (!fp) return false;
        return fp === sel || fp.startsWith(`${sel}/`);
      });
    }
    if (!selectedRepo) {
      if (selectedFormat)
        result = result.filter(
          (n: Note) => (n.format ?? "markdown") === selectedFormat,
        );
      if (selectedTags.length > 0)
        result = result.filter((n: Note) =>
          selectedTags.every((tag) => n.tags?.includes(tag)),
        );
      return result;
    }
    result = result.filter((n: Note) => n.repo === selectedRepo.path);
    if (selectedBranch)
      result = result.filter((n: Note) => n.branch === selectedBranch);
    if (selectedFormat)
      result = result.filter(
        (n: Note) => (n.format ?? "markdown") === selectedFormat,
      );
    if (selectedTags.length > 0)
      result = result.filter((n: Note) =>
        selectedTags.every((tag) => n.tags?.includes(tag)),
      );
    return result;
  }, [
    filteredNotes,
    selectedRepo,
    selectedBranch,
    selectedFolder,
    selectedFormat,
    selectedTags,
  ]);

  const hasActiveSearch = searchQuery.trim().length > 0;
  const searchMatchCount = hasActiveSearch ? displayNotes.length : 0;

  useEffect(() => {
    if (!hasActiveSearch || searchMatchCount === 0) {
      setCurrentSearchMatchIndex(0);
      return;
    }

    setCurrentSearchMatchIndex((previous) => {
      if (previous >= searchMatchCount) return searchMatchCount - 1;
      return previous;
    });
  }, [hasActiveSearch, searchMatchCount]);

  const handleClearFilters = useCallback(() => {
    setSelectedRepo(null);
    setSelectedBranch(null);
    setSelectedFormat(null);
    setSelectedFolder(null);
    setSelectedTags([]);
  }, []);

  const handleNotePress = useCallback(
    (note: Note) => {
      if (note.format === "pdf" && note.repo && note.filePath) {
        const info = parseRepoPath(note.repo);
        if (info) {
          navigation.navigate("PdfViewer", {
            owner: info.owner,
            repo: info.repo,
            branch: note.branch,
            path: note.filePath,
            title: note.title,
          });
          return;
        }
      }
      navigation.navigate("NoteEditor", { noteId: note.id });
    },
    [navigation],
  );

  const [longPressedNote, setLongPressedNote] = useState<Note | null>(null);

  const handleNoteLongPress = useCallback(
    (note: Note) => {
      HapticService.medium();
      setLongPressedNote(note);
    },
    [],
  );

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      HapticService.selection();
      setViewMode(mode);
      setShowViewModePicker(false);
    },
    [setViewMode],
  );

  const handleDeleteFromSwipe = useCallback(
    (note: Note) => {
      Alert.alert("Delete Note", `Delete "${note.title || "Untitled"}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!(await deleteNote(note.id))) {
              Alert.alert("Error", "Failed to delete note");
              return;
            }
            HapticService.success();
          },
        },
      ]);
    },
    [deleteNote],
  );

  const scrollToSearchMatch = useCallback(
    (targetIndex: number) => {
      if (searchMatchCount === 0) return;

      const boundedIndex =
        ((targetIndex % searchMatchCount) + searchMatchCount) %
        searchMatchCount;
      setCurrentSearchMatchIndex(boundedIndex);
      listRef.current?.scrollToIndex({
        index: boundedIndex,
        animated: true,
        viewPosition: 0.4,
      });
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

  const handlePullToRefresh = useCallback(async () => {
    if (isPullRefreshing) return;

    setIsPullRefreshing(true);
    HapticService.light();

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Sync timed out")), 60000);
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
      console.warn("[Sync] pull-refresh failed:", pullError);
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      setIsPullRefreshing(false);
    }
  }, [isPullRefreshing, refreshNotes]);

  const renderSwipeActions = useCallback(
    (note: Note) => (
      <View style={styles.swipeActionTrack}>
        <TouchableOpacity
          style={[styles.swipeAction, { backgroundColor: colors.error }]}
          onPress={() => handleDeleteFromSwipe(note)}
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.swipeActionText}>Delete</Text>
        </TouchableOpacity>
      </View>
    ),
    [colors.error, handleDeleteFromSwipe],
  );

  const renderSwipeableNote = useCallback(
    (note: Note, index: number, compact = false) => (
      <ReanimatedSwipeable
        overshootRight={false}
        rightThreshold={40}
        renderRightActions={() => renderSwipeActions(note)}
      >
        <NoteCard
          note={note}
          onPress={handleNotePress}
          onLongPress={handleNoteLongPress}
          compact={compact}
          highlighted={hasActiveSearch && index === currentSearchMatchIndex}
        />
      </ReanimatedSwipeable>
    ),
    [
      currentSearchMatchIndex,
      handleNoteLongPress,
      handleNotePress,
      hasActiveSearch,
      renderSwipeActions,
    ],
  );

  const renderNote = useCallback(
    ({ item, index }: { item: Note; index: number }) =>
      renderSwipeableNote(item, index),
    [renderSwipeableNote],
  );

  const renderGridNote = useCallback(
    ({ item, index }: { item: Note; index: number }) => (
      <View style={[styles.gridItem, isTablet && styles.gridItemTablet]}>
        {renderSwipeableNote(item, index, true)}
      </View>
    ),
    [renderSwipeableNote, isTablet],
  );

  const renderCardNote = useCallback(
    ({ item, index }: { item: Note; index: number }) => (
      <View style={styles.cardItem}>{renderSwipeableNote(item, index)}</View>
    ),
    [renderSwipeableNote],
  );

  const renderJournalNote = useCallback(
    ({ item, index }: { item: Note; index: number }) => (
      <View style={styles.journalItem}>
        <Text style={[styles.journalDate, { color: colors.textSecondary }]}>
          {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ""}
        </Text>
        {renderSwipeableNote(item, index)}
      </View>
    ),
    [colors.textSecondary, renderSwipeableNote],
  );

  const keyExtractor = useCallback((item: Note) => item.id, []);

  const getListLayout = useCallback(() => {
    if (viewMode === "grid")
      return {
        numColumns: isTablet ? columns : 2,
        columnWrapperStyle: styles.gridRow,
      };
    return { numColumns: 1, columnWrapperStyle: undefined };
  }, [viewMode, isTablet, columns]);

  const getRenderItem = useCallback(() => {
    switch (viewMode) {
      case "grid":
        return renderGridNote;
      case "card":
        return renderCardNote;
      case "journal":
        return renderJournalNote;
      default:
        return renderNote;
    }
  }, [viewMode, renderNote, renderGridNote, renderCardNote, renderJournalNote]);

  const getListContentStyle = useCallback(() => {
    switch (viewMode) {
      case "grid":
        return styles.gridContent;
      case "card":
        return styles.cardContent;
      case "journal":
        return styles.journalContent;
      default:
        return styles.listContent;
    }
  }, [viewMode]);

  if (isLoading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[
        styles.container,
        { backgroundColor: colors.background },
        isTablet && {
          maxWidth: maxContentWidth,
          alignSelf: "center",
          width: "100%",
        },
      ]}
    >
      <NScreenHeader title="Notes" />

      <View style={styles.topBar}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search notes..."
          style={styles.searchBar}
        />
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.surface }]}
          onPress={() => {
            HapticService.light();
            setShowViewModePicker(!showViewModePicker);
          }}
        >
          <Ionicons
            name={VIEW_MODE_ICONS[viewMode]}
            size={20}
            color={colors.primary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.iconBtn,
            {
              backgroundColor:
                activeFilterCount > 0 ? colors.primary + "20" : colors.surface,
            },
          ]}
          onPress={() => {
            HapticService.light();
            setShowFilterModal(true);
          }}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={
              activeFilterCount > 0 ? colors.primary : colors.textSecondary
            }
          />
          {activeFilterCount > 0 && (
            <View
              style={[styles.filterBadge, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.iconBtn,
            {
              backgroundColor:
                pendingSync > 0 ? colors.primary + "20" : colors.surface,
            },
          ]}
          onPress={handleManualSync}
          disabled={isManualSyncing}
        >
          {isManualSyncing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons
              name={pendingSync > 0 ? "cloud-upload" : "cloud-done"}
              size={20}
              color={pendingSync > 0 ? colors.primary : colors.textSecondary}
            />
          )}
          {pendingSync > 0 && (
            <View
              style={[styles.filterBadge, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.filterBadgeText}>{pendingSync}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipContent}
      >
        <TouchableOpacity
          style={[
            styles.chip,
            {
              borderColor: !selectedRepo
                ? colors.primary
                : colors.border + "60",
            },
            !selectedRepo && { backgroundColor: colors.primary + "15" },
          ]}
          onPress={() => {
            HapticService.selection();
            setSelectedRepo(null);
            setSelectedBranch(null);
          }}
        >
          <Ionicons
            name="home-outline"
            size={13}
            color={!selectedRepo ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.chipText,
              { color: !selectedRepo ? colors.primary : colors.text },
            ]}
          >
            All Notes
          </Text>
        </TouchableOpacity>
        {repositories.map((repo) => (
          <TouchableOpacity
            key={repo.id}
            style={[
              styles.chip,
              {
                borderColor:
                  selectedRepo?.id === repo.id
                    ? colors.primary
                    : colors.border + "60",
              },
              selectedRepo?.id === repo.id && {
                backgroundColor: colors.primary + "15",
              },
            ]}
            onPress={() => {
              HapticService.selection();
              setSelectedRepo(repo);
              setSelectedBranch(null);
            }}
          >
            <Ionicons
              name="git-branch-outline"
              size={13}
              color={
                selectedRepo?.id === repo.id
                  ? colors.primary
                  : colors.textSecondary
              }
            />
            <Text
              style={[
                styles.chipText,
                {
                  color:
                    selectedRepo?.id === repo.id ? colors.primary : colors.text,
                },
              ]}
            >
              {repo.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {hasActiveSearch && (
        <View
          style={[
            styles.searchNavigatorRow,
            { backgroundColor: colors.surface },
          ]}
        >
          <Text
            style={[
              styles.searchNavigatorCount,
              { color: colors.textSecondary },
            ]}
          >
            {searchMatchCount > 0
              ? `${currentSearchMatchIndex + 1}/${searchMatchCount}`
              : "0/0"}
          </Text>
          <View style={styles.searchNavigatorActions}>
            <TouchableOpacity
              style={[
                styles.searchNavButton,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => handleSearchNavigate(-1)}
              disabled={searchMatchCount === 0}
            >
              <Ionicons
                name="chevron-up"
                size={18}
                color={
                  searchMatchCount === 0 ? colors.textSecondary : colors.text
                }
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.searchNavButton,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => handleSearchNavigate(1)}
              disabled={searchMatchCount === 0}
            >
              <Ionicons
                name="chevron-down"
                size={18}
                color={
                  searchMatchCount === 0 ? colors.textSecondary : colors.text
                }
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal
        visible={showViewModePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowViewModePicker(false)}
      >
        <TouchableOpacity
          style={styles.viewModeBackdrop}
          activeOpacity={1}
          onPress={() => setShowViewModePicker(false)}
        >
          <View style={[styles.viewModeSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.viewModeHandle, { backgroundColor: colors.border + '40' }]} />
            <Text style={[styles.viewModeSheetTitle, { color: colors.textSecondary }]}>View Mode</Text>
            <View style={styles.viewModeSheetOptions}>
              {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.viewModeSheetOption,
                    viewMode === mode && { backgroundColor: colors.primary + "15" },
                  ]}
                  onPress={() => handleViewModeChange(mode)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={VIEW_MODE_ICONS[mode]}
                    size={22}
                    color={viewMode === mode ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.viewModeSheetLabel,
                      { color: viewMode === mode ? colors.primary : colors.text },
                    ]}
                  >
                    {VIEW_MODE_LABELS[mode]}
                  </Text>
                  {viewMode === mode && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {activeFilterCount > 0 && (
        <View style={styles.activeFilterWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipContent}
          >
            {selectedFormat && (
              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    borderColor: colors.primary,
                    backgroundColor: colors.primary + "15",
                  },
                ]}
                onPress={() => setSelectedFormat(null)}
              >
                <Ionicons
                  name="document-outline"
                  size={12}
                  color={colors.primary}
                />
                <Text style={[styles.chipText, { color: colors.primary }]}>
                  {FORMAT_LABELS[selectedFormat]}
                </Text>
                <Ionicons name="close" size={12} color={colors.primary} />
              </TouchableOpacity>
            )}
            {selectedFolder && (
              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    borderColor: colors.primary,
                    backgroundColor: colors.primary + "15",
                  },
                ]}
                onPress={() => setSelectedFolder(null)}
              >
                <Ionicons
                  name="folder-outline"
                  size={12}
                  color={colors.primary}
                />
                <Text style={[styles.chipText, { color: colors.primary }]}>
                  {selectedFolder}
                </Text>
                <Ionicons name="close" size={12} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.chip, { borderColor: colors.border + "60" }]}
              onPress={() => {
                setSelectedFormat(null);
                setSelectedFolder(null);
                setSelectedTags([]);
              }}
            >
              <Text style={[styles.chipText, { color: colors.textSecondary }]}>
                Clear all
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {error && (
        <View
          style={[
            styles.errorBanner,
            {
              backgroundColor: colors.error + "20",
              borderLeftColor: colors.error,
            },
          ]}
        >
          <Text style={[styles.errorText, { color: colors.error }]}>
            {error}
          </Text>
        </View>
      )}

      <FlashList
        ref={listRef}
        data={displayNotes}
        renderItem={getRenderItem()}
        keyExtractor={keyExtractor}
        key={viewMode}
        {...getListLayout()}
        contentContainerStyle={getListContentStyle()}
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={handlePullToRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name="document-text-outline"
              size={48}
              color={colors.textSecondary}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {searchQuery || activeFilterCount > 0
                ? "No matching notes"
                : "No notes yet"}
            </Text>
            <Text
              style={[styles.emptySubtext, { color: colors.textSecondary }]}
            >
              {searchQuery || activeFilterCount > 0
                ? "Try adjusting your search or filters"
                : "Create your first note to get started"}
            </Text>
          </View>
        }
      />

      {/* ── Filter modal ── */}
      <Modal visible={showFilterModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalSheet, { backgroundColor: colors.surface }]}
          >
            <View
              style={[styles.modalHeader, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Filter Notes
              </Text>
              <View style={styles.modalHeaderRight}>
                {activeFilterCount > 0 && (
                  <TouchableOpacity
                    onPress={handleClearFilters}
                    style={styles.clearFiltersBtn}
                  >
                    <Text
                      style={[
                        styles.clearFiltersText,
                        { color: colors.primary },
                      ]}
                    >
                      Clear
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                  <Ionicons
                    name="close"
                    size={24}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.filterBody} contentContainerStyle={styles.filterBodyContent}>
              {/* Repository */}
              {repositories.length > 0 && (
                <>
                  <Text
                    style={[styles.filterLabel, { color: colors.textSecondary }]}
                  >
                    Repository
                  </Text>
                  <View style={styles.filterChipRowWrap}>
                    <TouchableOpacity
                      style={[
                        styles.filterChip,
                        { borderColor: colors.border },
                        !selectedRepo && {
                          borderColor: colors.primary,
                          backgroundColor: colors.primary + "15",
                        },
                      ]}
                      onPress={() => {
                        HapticService.selection();
                        setSelectedRepo(null);
                        setSelectedBranch(null);
                      }}
                    >
                      <Ionicons
                        name="home-outline"
                        size={13}
                        color={!selectedRepo ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: !selectedRepo ? colors.primary : colors.text },
                        ]}
                      >
                        All
                      </Text>
                    </TouchableOpacity>
                    {repositories.map((repo) => (
                      <TouchableOpacity
                        key={repo.id}
                        style={[
                          styles.filterChip,
                          { borderColor: colors.border },
                          selectedRepo?.id === repo.id && {
                            borderColor: colors.primary,
                            backgroundColor: colors.primary + "15",
                          },
                        ]}
                        onPress={() => {
                          HapticService.selection();
                          setSelectedRepo(repo);
                          setSelectedBranch(null);
                        }}
                      >
                        <Ionicons
                          name="git-branch-outline"
                          size={13}
                          color={
                            selectedRepo?.id === repo.id
                              ? colors.primary
                              : colors.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.filterChipText,
                            {
                              color:
                                selectedRepo?.id === repo.id
                                  ? colors.primary
                                  : colors.text,
                            },
                          ]}
                        >
                          {repo.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Format / Type */}
              <Text
                style={[styles.filterLabel, { color: colors.textSecondary }]}
              >
                Note Type
              </Text>
              <View style={styles.filterChipRowWrap}>
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    { borderColor: colors.border },
                    !selectedFormat && {
                      borderColor: colors.primary,
                      backgroundColor: colors.primary + "15",
                    },
                  ]}
                  onPress={() => setSelectedFormat(null)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: !selectedFormat ? colors.primary : colors.text },
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                {(Object.entries(FORMAT_LABELS) as [NoteFormat, string][]).map(
                  ([fmt, label]) => (
                    <TouchableOpacity
                      key={fmt}
                      style={[
                        styles.filterChip,
                        { borderColor: colors.border },
                        selectedFormat === fmt && {
                          borderColor: colors.primary,
                          backgroundColor: colors.primary + "15",
                        },
                      ]}
                      onPress={() => {
                        HapticService.selection();
                        setSelectedFormat(fmt);
                      }}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={13}
                        color={
                          selectedFormat === fmt
                            ? colors.primary
                            : colors.textSecondary
                        }
                      />
                      <Text
                        style={[
                          styles.filterChipText,
                          {
                            color:
                              selectedFormat === fmt
                                ? colors.primary
                                : colors.text,
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>

              {/* Folder */}
              {allFolders.length > 0 && (
                <>
                  <Text
                    style={[
                      styles.filterLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Folder
                  </Text>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterChipRow}
                    data={allFolders}
                    keyExtractor={(folder: string) => folder}
                    ListHeaderComponent={
                      <TouchableOpacity
                        style={[
                          styles.filterChip,
                          { borderColor: colors.border },
                          !selectedFolder && {
                            borderColor: colors.primary,
                            backgroundColor: colors.primary + "15",
                          },
                        ]}
                        onPress={() => setSelectedFolder(null)}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            {
                              color: !selectedFolder
                                ? colors.primary
                                : colors.text,
                            },
                          ]}
                        >
                          All
                        </Text>
                      </TouchableOpacity>
                    }
                    renderItem={({ item: folder }) => {
                      const isSelected = selectedFolder === folder;
                      return (
                        <TouchableOpacity
                          style={[
                            styles.filterChip,
                            { borderColor: colors.border },
                            isSelected && {
                              borderColor: colors.primary,
                              backgroundColor: colors.primary + "15",
                            },
                          ]}
                          onPress={() => {
                            HapticService.selection();
                            setSelectedFolder(isSelected ? null : folder);
                          }}
                        >
                          <Ionicons
                            name="folder-outline"
                            size={13}
                            color={
                              isSelected
                                ? colors.primary
                                : colors.textSecondary
                            }
                          />
                          <Text
                            style={[
                              styles.filterChipText,
                              {
                                color: isSelected
                                  ? colors.primary
                                  : colors.text,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {folder}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                </>
              )}

              {/* Tags */}
              {allTags.length > 0 && (
                <>
                  <Text
                    style={[
                      styles.filterLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Tags
                  </Text>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterChipRow}
                    data={allTags}
                    keyExtractor={(tag: string) => tag}
                    renderItem={({ item: tag }) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <TouchableOpacity
                          style={[
                            styles.filterChip,
                            { borderColor: colors.border },
                            isSelected && {
                              borderColor: colors.primary,
                              backgroundColor: colors.primary + "15",
                            },
                          ]}
                          onPress={() => {
                            HapticService.selection();
                            setSelectedTags((prev) =>
                              isSelected
                                ? prev.filter((t) => t !== tag)
                                : [...prev, tag],
                            );
                          }}
                        >
                          <Ionicons
                            name="pricetag-outline"
                            size={13}
                            color={
                              isSelected ? colors.primary : colors.textSecondary
                            }
                          />
                          <Text
                            style={[
                              styles.filterChipText,
                              {
                                color: isSelected
                                  ? colors.primary
                                  : colors.text,
                              },
                            ]}
                          >
                            {tag}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                </>
              )}

              <View style={{ height: 24 }} />
            </ScrollView>

            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowFilterModal(false)}
            >
              <Text style={styles.applyButtonText}>
                {activeFilterCount > 0
                  ? `Show ${displayNotes.length} notes`
                  : "Done"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ContextMenu
        visible={longPressedNote !== null}
        onClose={() => setLongPressedNote(null)}
        title={longPressedNote?.title || "Untitled"}
        subtitle={longPressedNote?.filePath ?? undefined}
        headerIcon={longPressedNote?.format === "pdf" ? "document" : "document-text"}
        sections={
          longPressedNote
            ? [
                {
                  items: [
                    {
                      icon: "eye-outline",
                      label: "Open",
                      onPress: () => handleNotePress(longPressedNote),
                    },
                    {
                      icon: longPressedNote.isPinned ? "pin" : "pin-outline",
                      label: longPressedNote.isPinned ? "Unpin" : "Pin",
                      onPress: async () => {
                        if (!(await togglePin(longPressedNote.id))) {
                          Alert.alert("Error", "Failed to update pin status");
                        }
                      },
                    },
                    {
                      icon: "share-outline",
                      label: "Share / Save",
                      onPress: async () => {
                        const ok = await ShareService.shareByNoteFormat(longPressedNote);
                        if (!ok) Alert.alert("Error", "Failed to share note");
                      },
                    },
                    {
                      icon: "copy-outline",
                      label: "Duplicate",
                      onPress: async () => {
                        const src = longPressedNote;
                        const created = await createNote({
                          title: `${src.title || 'Untitled'} (copy)`,
                          content: src.content ?? '',
                          tags: src.tags ? [...src.tags] : undefined,
                          repo: src.repo,
                          branch: src.branch,
                          folderPath: src.folderPath,
                          format: src.format,
                          attachments: src.attachments ? [...src.attachments] : undefined,
                        });
                        if (created) {
                          HapticService.success();
                        } else {
                          HapticService.error();
                          Alert.alert("Error", "Failed to duplicate note");
                        }
                      },
                    },
                  ],
                },
                {
                  items: [
                    {
                      icon: "trash-outline",
                      label: "Delete",
                      destructive: true,
                      onPress: async () => {
                        if (!(await deleteNote(longPressedNote.id))) {
                          Alert.alert("Error", "Failed to delete note");
                        }
                      },
                    },
                  ],
                },
              ]
            : []
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchNavigatorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchNavigatorCount: {
    fontSize: 12,
    fontWeight: "500",
  },
  searchNavigatorActions: {
    flexDirection: "row",
    gap: 6,
  },
  searchNavButton: {
    width: 34,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  searchBar: { flex: 1 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  filterBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  filterBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  viewModeBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  viewModeSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  viewModeHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  viewModeSheetTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  viewModeSheetOptions: {
    paddingHorizontal: 12,
  },
  viewModeSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    gap: 12,
  },
  viewModeSheetLabel: {
    fontSize: 16,
    flex: 1,
  },
  chipRow: { marginHorizontal: 12, marginBottom: 4, minHeight: 50, maxHeight: 50 },
  activeFilterWrap: { marginHorizontal: 12, marginTop: 4, marginBottom: 4 },
  chipContent: { gap: 6, paddingTop: 6, paddingBottom: 8, paddingRight: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    backgroundColor: "transparent",
  },
  chipText: { fontSize: 12, fontWeight: "500" },
  errorBanner: {
    marginHorizontal: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  errorText: { fontSize: 13 },
  listContent: { padding: 12, paddingTop: 4, paddingBottom: 100 },
  gridRow: { justifyContent: "space-between" },
  gridContent: { padding: 12, paddingTop: 4, paddingBottom: 100 },
  gridItem: { width: "48%", marginBottom: 12 },
  gridItemTablet: { width: "31%", marginBottom: 12 },
  cardContent: { padding: 12, paddingTop: 4, paddingBottom: 100 },
  cardItem: { marginBottom: 12 },
  journalContent: { padding: 12, paddingTop: 4, paddingBottom: 100 },
  journalItem: { marginBottom: 8 },
  journalDate: { fontSize: 12, marginBottom: 4, marginLeft: 4 },
  swipeActionTrack: {
    width: 80,
    marginVertical: 8,
  },
  swipeAction: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  swipeActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtext: { fontSize: 14, textAlign: "center" },
  // Filter modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "80%",
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 18, fontWeight: "600" },
  modalHeaderRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  clearFiltersBtn: { paddingHorizontal: 4 },
  clearFiltersText: { fontSize: 15, fontWeight: "500" },
  filterBody: { padding: 16 },
  filterBodyContent: { paddingBottom: 16 },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  filterChipRow: { marginBottom: 16 },
  filterChipRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    gap: 5,
  },
  filterChipText: { fontSize: 14 },
  applyButton: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  applyButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
