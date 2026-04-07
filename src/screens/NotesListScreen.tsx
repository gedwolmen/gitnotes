import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useNotes } from '../contexts/NoteContext';
import { useFolders } from '../contexts/FolderContext';
import { useTheme } from '../contexts/ThemeContext';
import { useViewMode } from '../contexts/ViewModeContext';
import { RootStackParamList } from '../navigation/types';
import { Note, NoteFormat, filterNotesByFolder } from '../models/Note';
import { Folder } from '../models/Folder';
import { GitRepository, GitBranch, GitService } from '../services/GitService';
import NoteCard from '../components/NoteCard';
import SearchBar from '../components/SearchBar';
import FolderBreadcrumb from '../components/FolderBreadcrumb';
import FolderTreeView from '../components/FolderTreeView';
import { HapticService } from '../utils/haptics';
import { ViewMode, VIEW_MODE_LABELS, VIEW_MODE_ICONS } from '../utils/viewModes';
import { ShareService } from '../services/ShareService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const FORMAT_LABELS: Record<NoteFormat, string> = {
  markdown: '.md',
  neorg: '.norg',
  org: '.org',
};

export default function NotesListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { filteredNotes, isLoading, searchQuery, setSearchQuery, deleteNote, togglePin, error } = useNotes();
  const { folders } = useFolders();
  const { viewMode, setViewMode } = useViewMode();

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showFolderTree, setShowFolderTree] = useState(false);
  const [showViewModePicker, setShowViewModePicker] = useState(false);

  // Filters
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<NoteFormat | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    GitService.getRepositories().then(setRepositories);
  }, []);

  useEffect(() => {
    if (!selectedRepo) { setBranches([]); return; }
    setLoadingBranches(true);
    GitService.getBranches(selectedRepo.path)
      .then(setBranches)
      .finally(() => setLoadingBranches(false));
  }, [selectedRepo]);

  const activeFilterCount = (selectedRepo ? 1 : 0) + (selectedBranch ? 1 : 0) + (selectedFormat ? 1 : 0);

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) || null,
    [folders, selectedFolderId]
  );

  const notesInFolder = useMemo(
    () => filterNotesByFolder(filteredNotes, selectedFolderId),
    [filteredNotes, selectedFolderId]
  );

  const displayNotes = useMemo(() => {
    let result = notesInFolder;
    if (selectedRepo) result = result.filter(n => n.repo === selectedRepo.path);
    if (selectedBranch) result = result.filter(n => n.branch === selectedBranch);
    if (selectedFormat) result = result.filter(n => (n.format ?? 'markdown') === selectedFormat);
    return result;
  }, [notesInFolder, selectedRepo, selectedBranch, selectedFormat]);

  const handleClearFilters = useCallback(() => {
    setSelectedRepo(null);
    setSelectedBranch(null);
    setSelectedFormat(null);
  }, []);

  const handleNotePress = useCallback((note: Note) => {
    navigation.navigate('NoteEditor', { noteId: note.id });
  }, [navigation]);

  const handleNoteLongPress = useCallback((note: Note) => {
    HapticService.medium();
    Alert.alert(
      'Note Actions',
      `"${note.title || 'Untitled'}"`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share',
          onPress: async () => {
            const success = await ShareService.shareAsMarkdown(note);
            if (!success) Alert.alert('Error', 'Failed to share note');
          },
        },
        {
          text: note.isPinned ? 'Unpin' : 'Pin',
          onPress: async () => {
            if (!(await togglePin(note.id))) Alert.alert('Error', 'Failed to update pin status');
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!(await deleteNote(note.id))) Alert.alert('Error', 'Failed to delete note');
          },
        },
      ]
    );
  }, [deleteNote, togglePin]);

  const handleSelectFolder = useCallback((folder: Folder | null) => {
    HapticService.light();
    setSelectedFolderId(folder?.id || null);
    setShowFolderTree(false);
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    HapticService.selection();
    setViewMode(mode);
    setShowViewModePicker(false);
  }, [setViewMode]);

  const renderNote = useCallback(({ item }: { item: Note }) => (
    <NoteCard note={item} onPress={handleNotePress} onLongPress={handleNoteLongPress} />
  ), [handleNotePress, handleNoteLongPress]);

  const renderGridNote = useCallback(({ item }: { item: Note }) => (
    <View style={styles.gridItem}>
      <NoteCard note={item} onPress={handleNotePress} onLongPress={handleNoteLongPress} compact />
    </View>
  ), [handleNotePress, handleNoteLongPress]);

  const renderCardNote = useCallback(({ item }: { item: Note }) => (
    <View style={styles.cardItem}>
      <NoteCard note={item} onPress={handleNotePress} onLongPress={handleNoteLongPress} />
    </View>
  ), [handleNotePress, handleNoteLongPress]);

  const renderJournalNote = useCallback(({ item }: { item: Note }) => (
    <View style={styles.journalItem}>
      <Text style={[styles.journalDate, { color: colors.textSecondary }]}>
        {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}
      </Text>
      <NoteCard note={item} onPress={handleNotePress} onLongPress={handleNoteLongPress} />
    </View>
  ), [handleNotePress, handleNoteLongPress, colors]);

  const keyExtractor = useCallback((item: Note) => item.id, []);

  const getListLayout = useCallback(() => {
    if (viewMode === 'grid') return { numColumns: 2, columnWrapperStyle: styles.gridRow };
    return { numColumns: 1, columnWrapperStyle: undefined };
  }, [viewMode]);

  const getRenderItem = useCallback(() => {
    switch (viewMode) {
      case 'grid': return renderGridNote;
      case 'card': return renderCardNote;
      case 'journal': return renderJournalNote;
      default: return renderNote;
    }
  }, [viewMode, renderNote, renderGridNote, renderCardNote, renderJournalNote]);

  const getListContentStyle = useCallback(() => {
    switch (viewMode) {
      case 'grid': return styles.gridContent;
      case 'card': return styles.cardContent;
      case 'journal': return styles.journalContent;
      default: return styles.listContent;
    }
  }, [viewMode]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Search + action buttons ── */}
      <View style={styles.topBar}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search notes..."
          style={styles.searchBar}
        />
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.surface }]}
          onPress={() => { HapticService.light(); setShowFolderTree(!showFolderTree); }}
        >
          <Ionicons
            name={showFolderTree ? 'folder-open' : 'folder'}
            size={20}
            color={showFolderTree ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.surface }]}
          onPress={() => { HapticService.light(); setShowViewModePicker(!showViewModePicker); }}
        >
          <Ionicons name={VIEW_MODE_ICONS[viewMode] as any} size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: activeFilterCount > 0 ? colors.primary + '20' : colors.surface }]}
          onPress={() => { HapticService.light(); setShowFilterModal(true); }}
        >
          <Ionicons name="options-outline" size={20} color={activeFilterCount > 0 ? colors.primary : colors.textSecondary} />
          {activeFilterCount > 0 && (
            <View style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── View mode picker ── */}
      {showViewModePicker && (
        <View style={[styles.viewModePicker, { backgroundColor: colors.surface }]}>
          {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.viewModeOption, viewMode === mode && { backgroundColor: colors.primary + '20' }]}
              onPress={() => handleViewModeChange(mode)}
            >
              <Ionicons name={VIEW_MODE_ICONS[mode] as any} size={20} color={viewMode === mode ? colors.primary : colors.textSecondary} />
              <Text style={[styles.viewModeLabel, { color: viewMode === mode ? colors.primary : colors.text }]}>
                {VIEW_MODE_LABELS[mode]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Active filter chips ── */}
      {activeFilterCount > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipContent}>
          {selectedRepo && (
            <TouchableOpacity
              style={[styles.chip, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
              onPress={() => { setSelectedRepo(null); setSelectedBranch(null); }}
            >
              <Ionicons name="git-branch-outline" size={12} color={colors.primary} />
              <Text style={[styles.chipText, { color: colors.primary }]}>{selectedRepo.name}</Text>
              <Ionicons name="close" size={12} color={colors.primary} />
            </TouchableOpacity>
          )}
          {selectedBranch && (
            <TouchableOpacity
              style={[styles.chip, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
              onPress={() => setSelectedBranch(null)}
            >
              <Ionicons name="git-branch" size={12} color={colors.primary} />
              <Text style={[styles.chipText, { color: colors.primary }]}>{selectedBranch}</Text>
              <Ionicons name="close" size={12} color={colors.primary} />
            </TouchableOpacity>
          )}
          {selectedFormat && (
            <TouchableOpacity
              style={[styles.chip, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
              onPress={() => setSelectedFormat(null)}
            >
              <Ionicons name="document-outline" size={12} color={colors.primary} />
              <Text style={[styles.chipText, { color: colors.primary }]}>{FORMAT_LABELS[selectedFormat]}</Text>
              <Ionicons name="close" size={12} color={colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleClearFilters}
          >
            <Text style={[styles.chipText, { color: colors.textSecondary }]}>Clear all</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + '20', borderLeftColor: colors.error }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      {showFolderTree ? (
        <View style={[styles.folderTreeContainer, { backgroundColor: colors.surface }]}>
          <FolderTreeView folders={folders} selectedFolderId={selectedFolderId} onSelectFolder={handleSelectFolder} />
        </View>
      ) : (
        <>
          {selectedFolder && (
            <FolderBreadcrumb folders={folders} currentFolder={selectedFolder} onNavigateToFolder={handleSelectFolder} />
          )}
          <FlatList
            data={displayNotes}
            renderItem={getRenderItem()}
            keyExtractor={keyExtractor}
            key={`${viewMode}-${displayNotes.length}`}
            {...getListLayout()}
            contentContainerStyle={getListContentStyle()}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name={selectedFolderId ? 'folder-open-outline' : 'document-text-outline'}
                  size={48}
                  color={colors.textSecondary}
                />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {searchQuery || activeFilterCount > 0 ? 'No matching notes' : selectedFolderId ? 'No notes in this folder' : 'No notes yet'}
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                  {searchQuery || activeFilterCount > 0 ? 'Try adjusting your search or filters' : 'Create your first note to get started'}
                </Text>
              </View>
            }
          />
        </>
      )}

      {/* ── Filter modal ── */}
      <Modal visible={showFilterModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Filter Notes</Text>
              <View style={styles.modalHeaderRight}>
                {activeFilterCount > 0 && (
                  <TouchableOpacity onPress={handleClearFilters} style={styles.clearFiltersBtn}>
                    <Text style={[styles.clearFiltersText, { color: colors.primary }]}>Clear</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.filterBody}>
              {/* Repository */}
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Repository</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipRow}>
                <TouchableOpacity
                  style={[styles.filterChip, { borderColor: colors.border }, !selectedRepo && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                  onPress={() => { setSelectedRepo(null); setSelectedBranch(null); }}
                >
                  <Text style={[styles.filterChipText, { color: !selectedRepo ? colors.primary : colors.text }]}>All</Text>
                </TouchableOpacity>
                {repositories.map((repo) => (
                  <TouchableOpacity
                    key={repo.id}
                    style={[styles.filterChip, { borderColor: colors.border }, selectedRepo?.id === repo.id && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                    onPress={() => { HapticService.selection(); setSelectedRepo(repo); setSelectedBranch(null); }}
                  >
                    <Ionicons name="git-branch-outline" size={13} color={selectedRepo?.id === repo.id ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.filterChipText, { color: selectedRepo?.id === repo.id ? colors.primary : colors.text }]}>{repo.name}</Text>
                  </TouchableOpacity>
                ))}
                {repositories.length === 0 && (
                  <Text style={[styles.filterChipText, { color: colors.textSecondary, marginLeft: 4 }]}>No repos — add in Settings</Text>
                )}
              </ScrollView>

              {/* Branch */}
              {selectedRepo && (
                <>
                  <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Branch</Text>
                  {loadingBranches ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} />
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipRow}>
                      <TouchableOpacity
                        style={[styles.filterChip, { borderColor: colors.border }, !selectedBranch && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                        onPress={() => setSelectedBranch(null)}
                      >
                        <Text style={[styles.filterChipText, { color: !selectedBranch ? colors.primary : colors.text }]}>All</Text>
                      </TouchableOpacity>
                      {branches.map((branch) => (
                        <TouchableOpacity
                          key={branch.name}
                          style={[styles.filterChip, { borderColor: colors.border }, selectedBranch === branch.name && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                          onPress={() => { HapticService.selection(); setSelectedBranch(branch.name); }}
                        >
                          <Ionicons name="git-branch" size={13} color={selectedBranch === branch.name ? colors.primary : colors.textSecondary} />
                          <Text style={[styles.filterChipText, { color: selectedBranch === branch.name ? colors.primary : colors.text }]}>{branch.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </>
              )}

              {/* Format / Type */}
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Note Type</Text>
              <View style={styles.filterChipRowWrap}>
                <TouchableOpacity
                  style={[styles.filterChip, { borderColor: colors.border }, !selectedFormat && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                  onPress={() => setSelectedFormat(null)}
                >
                  <Text style={[styles.filterChipText, { color: !selectedFormat ? colors.primary : colors.text }]}>All</Text>
                </TouchableOpacity>
                {(Object.entries(FORMAT_LABELS) as [NoteFormat, string][]).map(([fmt, label]) => (
                  <TouchableOpacity
                    key={fmt}
                    style={[styles.filterChip, { borderColor: colors.border }, selectedFormat === fmt && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                    onPress={() => { HapticService.selection(); setSelectedFormat(fmt); }}
                  >
                    <Ionicons name="document-text-outline" size={13} color={selectedFormat === fmt ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.filterChipText, { color: selectedFormat === fmt ? colors.primary : colors.text }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>

            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowFilterModal(false)}
            >
              <Text style={styles.applyButtonText}>
                {activeFilterCount > 0 ? `Show ${displayNotes.length} notes` : 'Done'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchBar: { flex: 1 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  viewModePicker: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    padding: 4,
  },
  viewModeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  viewModeLabel: { fontSize: 12, fontWeight: '500' },
  chipRow: { maxHeight: 40, marginHorizontal: 12, marginBottom: 4 },
  chipContent: { gap: 6, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  chipText: { fontSize: 12, fontWeight: '500' },
  errorBanner: {
    marginHorizontal: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  errorText: { fontSize: 13 },
  folderTreeContainer: { flex: 1, marginHorizontal: 12, marginTop: 4, borderRadius: 12 },
  listContent: { padding: 12, paddingTop: 4 },
  gridRow: { justifyContent: 'space-between' },
  gridContent: { padding: 12, paddingTop: 4 },
  gridItem: { width: '48%', marginBottom: 12 },
  cardContent: { padding: 12, paddingTop: 4 },
  cardItem: { marginBottom: 12 },
  journalContent: { padding: 12, paddingTop: 4 },
  journalItem: { marginBottom: 8 },
  journalDate: { fontSize: 12, marginBottom: 4, marginLeft: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  emptySubtext: { fontSize: 14, textAlign: 'center' },
  // Filter modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  modalHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clearFiltersBtn: { paddingHorizontal: 4 },
  clearFiltersText: { fontSize: 15, fontWeight: '500' },
  filterBody: { padding: 16 },
  filterLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  filterChipRow: { marginBottom: 16 },
  filterChipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
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
    alignItems: 'center',
  },
  applyButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
