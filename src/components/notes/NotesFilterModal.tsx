import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';
import { HapticService } from '../../utils/haptics';
import { GitRepository } from '../../services/GitService';
import { NoteColor, NOTE_COLOR_VALUES, NoteFormat } from '../../models/Note';
import { NOTE_COLORS } from '../../theme/tokens';
import { NOTE_FORMAT_LABELS, NotesListFilters, FolderTree, buildFolderHierarchy } from './notesShared';

interface NotesFilterModalProps {
  visible: boolean;
  filters: NotesListFilters;
  repositories: GitRepository[];
  allBranches: string[];
  allFolders: string[];
  allTags: string[];
  allColors: NoteColor[];
  displayCount: number;
  activeFilterCount: number;
  onClose: () => void;
  onClearFilters: () => void;
  onSelectRepo: (repo: GitRepository | null) => void;
  onSelectFormat: (format: NoteFormat | null) => void;
  onSelectBranch: (branch: string | null) => void;
  onSelectFolder: (folder: string | null) => void;
  onToggleTag: (tag: string) => void;
  onToggleColor: (color: NoteColor) => void;
}

export function NotesFilterModal({
  visible,
  filters,
  repositories,
  allBranches,
  allFolders,
  allTags,
  allColors,
  displayCount,
  activeFilterCount,
  onClose,
  onClearFilters,
  onSelectRepo,
  onSelectFormat,
  onSelectBranch,
  onSelectFolder,
  onToggleTag,
  onToggleColor,
}: NotesFilterModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const {
    selectedRepo,
    selectedFormat,
    selectedBranch,
    selectedFolder,
    selectedTags,
    selectedColors,
  } = filters;

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const folderHierarchy = useMemo(() => buildFolderHierarchy(allFolders), [allFolders]);

  const toggleExpanded = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectWithHaptic = (action: () => void) => {
    HapticService.selection();
    action();
  };

  const renderFolderTree = (folders: FolderTree[], level: number = 0): React.ReactNode => {
    return folders.map(folder => {
      const isExpanded = expandedFolders.has(folder.path);
      const hasChildren = folder.children.length > 0;
      const isSelected = selectedFolder === folder.path;

      return (
        <View key={folder.path}>
          <View style={[styles.folderRow, level > 0 && { paddingLeft: 16 + level * 16 }]}>
            {hasChildren && (
              <TouchableOpacity onPress={() => toggleExpanded(folder.path)} style={styles.expandButton}>
                <Ionicons
                  name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                  size={14}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
            {!hasChildren && <View style={{ width: 0 }} />}
            <TouchableOpacity
              style={[
                styles.chip,
                { borderColor: colors.border },
                isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
              ]}
              onPress={() => selectWithHaptic(() => onSelectFolder(isSelected ? null : folder.path))}
            >
              <Ionicons
                name={isExpanded ? 'folder-open' : 'folder-outline'}
                size={13}
                color={isSelected ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[styles.chipText, { color: isSelected ? colors.primary : colors.text }]}
                numberOfLines={1}
              >
                {folder.name}
              </Text>
            </TouchableOpacity>
          </View>
          {isExpanded && hasChildren && renderFolderTree(folder.children, level + 1)}
        </View>
      );
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}> 
          <View style={[styles.header, { borderBottomColor: colors.border }]}> 
            <Text style={[styles.title, { color: colors.text }]}>{t('notes.filterNotes')}</Text>
            <View style={styles.headerRight}>
              {activeFilterCount > 0 ? (
                <TouchableOpacity testID="notes-filter-modal.button.clear" onPress={onClearFilters} style={styles.clearButton}>
                  <Text style={[styles.clearText, { color: colors.primary }]}>{t('common.clear')}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity testID="notes-filter-modal.button.close" onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {repositories.length > 0 ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('notesFilter.repository')}</Text>
                <View style={styles.chipWrap}>
                  <TouchableOpacity
                    testID="notes-filter-modal.button.select-repo-all"
                    style={[
                      styles.chip,
                      { borderColor: colors.border },
                      !selectedRepo && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                    ]}
                    onPress={() => selectWithHaptic(() => onSelectRepo(null))}
                  >
                    <Ionicons
                      name="home-outline"
                      size={13}
                      color={!selectedRepo ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.chipText, { color: !selectedRepo ? colors.primary : colors.text }]}>{t('common.all')}</Text>
                  </TouchableOpacity>
                  {repositories.map((repo) => {
                    const isSelected = selectedRepo?.id === repo.id;
                    return (
                      <TouchableOpacity
                        key={repo.id}
                        testID={`notes-filter-modal.button.select-repo-${repo.id}`}
                        style={[
                          styles.chip,
                          { borderColor: colors.border },
                          isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                        ]}
                        onPress={() => selectWithHaptic(() => onSelectRepo(repo))}
                      >
                        <Ionicons
                          name="git-branch-outline"
                          size={13}
                          color={isSelected ? colors.primary : colors.textSecondary}
                        />
                        <Text style={[styles.chipText, { color: isSelected ? colors.primary : colors.text }]}>
                          {repo.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('notesFilter.noteType')}</Text>
            <View style={styles.chipWrap}>
              <TouchableOpacity
                testID="notes-filter-modal.button.select-format-all"
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  !selectedFormat && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                ]}
                onPress={() => onSelectFormat(null)}
              >
                <Text style={[styles.chipText, { color: !selectedFormat ? colors.primary : colors.text }]}>{t('common.all')}</Text>
              </TouchableOpacity>
              {(Object.entries(NOTE_FORMAT_LABELS) as [Exclude<NoteFormat, 'json'>, string][]).map(
                ([format, label]) => {
                  const isSelected = selectedFormat === format;
                  return (
                    <TouchableOpacity
                      key={format}
                      testID={`notes-filter-modal.button.select-format-${format}`}
                      style={[
                        styles.chip,
                        { borderColor: colors.border },
                        isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                      ]}
                      onPress={() => selectWithHaptic(() => onSelectFormat(format))}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={13}
                        color={isSelected ? colors.primary : colors.textSecondary}
                      />
                      <Text style={[styles.chipText, { color: isSelected ? colors.primary : colors.text }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                },
              )}
            </View>

            {selectedRepo && allBranches.length > 0 ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('notesFilter.branch')}</Text>
                <View style={styles.chipWrap}>
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      { borderColor: colors.border },
                      !selectedBranch && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                    ]}
                    testID="notes-filter-modal.button.select-branch-all"
                    onPress={() => onSelectBranch(null)}
                  >
                    <Text style={[styles.chipText, { color: !selectedBranch ? colors.primary : colors.text }]}>{t('common.all')}</Text>
                  </TouchableOpacity>
                  {allBranches.map((branch) => {
                    const isSelected = selectedBranch === branch;
                    return (
                      <TouchableOpacity
                        key={branch}
                        testID={`notes-filter-modal.button.select-branch-${branch}`}
                        style={[
                          styles.chip,
                          { borderColor: colors.border },
                          isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                        ]}
                        onPress={() => selectWithHaptic(() => onSelectBranch(isSelected ? null : branch))}
                      >
                        <Ionicons
                          name="git-branch-outline"
                          size={13}
                          color={isSelected ? colors.primary : colors.textSecondary}
                        />
                        <Text
                          style={[styles.chipText, { color: isSelected ? colors.primary : colors.text }]}
                          numberOfLines={1}
                        >
                          {branch}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {allFolders.length > 0 ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('notesFilter.folder')}</Text>
                <View style={styles.folderTreeContainer}>
                  <TouchableOpacity
                    testID="notes-filter-modal.button.select-folder"
                    style={[
                      styles.chip,
                      { borderColor: colors.border },
                      !selectedFolder && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                    ]}
                    onPress={() => selectWithHaptic(() => onSelectFolder(null))}
                  >
                    <Ionicons
                      name="home-outline"
                      size={13}
                      color={!selectedFolder ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.chipText, { color: !selectedFolder ? colors.primary : colors.text }]}>{t('common.all')}</Text>
                  </TouchableOpacity>
                  {renderFolderTree(folderHierarchy)}
                </View>
              </>
            ) : null}

            {allTags.length > 0 ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('notesFilter.tags')}</Text>
                <View style={styles.chipWrap}>
                  {allTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        testID="notes-filter-modal.button.toggle-tag"
                        style={[
                          styles.chip,
                          { borderColor: colors.border },
                          isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                        ]}
                        onPress={() => selectWithHaptic(() => onToggleTag(tag))}
                      >
                        <Ionicons
                          name="pricetag-outline"
                          size={13}
                          color={isSelected ? colors.primary : colors.textSecondary}
                        />
                        <Text style={[styles.chipText, { color: isSelected ? colors.primary : colors.text }]}>
                          {tag}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {allColors.length > 0 ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('notesFilter.color')}</Text>
                <View style={styles.chipWrap}>
                  {allColors
                    .filter((color) => NOTE_COLOR_VALUES.includes(color))
                    .map((color) => {
                      const isSelected = selectedColors.includes(color);
                      return (
                        <TouchableOpacity
                          key={color}
                          testID="notes-filter-modal.button.toggle-color"
                          style={[
                            styles.chip,
                            { borderColor: colors.border },
                            isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                          ]}
                          onPress={() => selectWithHaptic(() => onToggleColor(color))}
                        >
                          <View style={[styles.swatch, { backgroundColor: NOTE_COLORS[color] }]} />
                          <Text
                            style={[
                              styles.chipText,
                              { color: isSelected ? colors.primary : colors.text, textTransform: 'capitalize' },
                            ]}
                          >
                            {color}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </>
            ) : null}

            <View style={styles.bottomSpacer} />
          </ScrollView>

          <TouchableOpacity style={[styles.applyButton, { backgroundColor: colors.primary }]} onPress={onClose}>
            <Text style={styles.applyButtonText}>
              {activeFilterCount > 0 ? `Show ${displayCount} notes` : 'Done'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clearButton: { paddingHorizontal: 4 },
  clearText: { fontSize: 15, fontWeight: '500' },
  body: { padding: 16 },
  bodyContent: { paddingBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    gap: 5,
  },
  chipText: { fontSize: 14 },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  bottomSpacer: { height: 24 },
  applyButton: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  folderTreeContainer: {
    gap: 6,
    marginBottom: 16,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expandButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandButtonPlaceholder: {
    width: 24,
  },
});
