import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Alert, Platform, RefreshControl, ActivityIndicator } from 'react-native';
import { FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { requireRepo } from '../utils/requireRepo';
import { useTodos } from '../contexts/TodoContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { slugifyTodoText, Todo, TodoPriority } from '../models/Todo';
import { SortMode } from '../types/SortTypes';
import { HapticService } from '../utils/haptics';
import { syncTodoToGitHub } from '../services/TodoGitHubSyncService';
import { FEATURE_STAGE_PUSH } from '../services/featureFlags';
import { StagingService } from '../services/git/StagingService';
import { syncNow } from '../services/git/manualSync';
import { batchDeleteFiles } from '../services/git/BatchGitOperations';
import { resolveBranch } from '../services/git/resolveBranch';
import { formatSyncError } from '../services/git/formatSyncError';
import { SyncEngineService } from '../services/SyncEngineService';
import { StorageService } from '../services/StorageService';
import { parseRepoPath } from '../utils/gitPathParser';
import { IconButton, ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { ConflictBanner } from '../components/ui/ConflictBanner';
import { EntityFilterModal } from '../components/EntityFilterModal';
import { FilterBar, FilterChip } from '../components/FilterBar';
import { useEntityFilter } from '../hooks/useEntityFilter';
import { useRepos } from '../contexts/RepoContext';
import { useTodoStore } from '../stores/todoStore';
import { useEntityList } from '../hooks/useEntityList';
import { TodoCard } from '../components/todos/TodoCard';
import { TodosEmptyState } from '../components/todos/TodosEmptyState';
import { TodosListHeader } from '../components/todos/TodosListHeader';
import { TodoEditorModal } from '../components/todos/TodoEditorModal';
import { SwipeableListItem } from '../components/list/SwipeableListItem';
import { BulkActionBar } from '../components/list/BulkActionBar';
import { useResponsive } from '../hooks/useResponsive';
import { useGitHubActivityStore } from '../stores/githubActivityStore';
import { gitOperationRegistry, useGitOperationStore } from '../stores/gitOperationStore';
import { GitSyncGate } from '../services/git/GitSyncGate';
import { useEntityLock } from '../hooks/useGitOpLock';
import { useTranslation } from 'react-i18next';
import { LastSelectionPreferenceService } from '../services/LastSelectionPreferenceService';

const FILTER_COMPLETED_PERSISTENCE_KEY = '@gitnotes:filters:todo-completed';

/** Mirrors TodoGitHubSyncService.serializeTodo so staged todos keep the on-disk shape. */
function serializeTodoForStage(todo: Partial<Todo>): string {
  const data = {
    text: todo.text ?? '',
    completed: todo.completed ?? false,
    priority: todo.priority,
    notes: todo.notes,
    tags: todo.tags ?? [],
    dueDate: todo.dueDate,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
  };
  return JSON.stringify(data, null, 2);
}

interface LockedTodoRowProps {
  item: Todo;
  selected: boolean;
  selectionMode: boolean;
  onToggleSelect: () => void;
  onPress: (todo: Todo) => void;
  onToggle: (id: string) => void;
}

function LockedTodoRow({ item, selected, selectionMode, onToggleSelect, onPress, onToggle }: LockedTodoRowProps) {
  const { colors } = useTheme();
  const lock = useEntityLock(item.id, { repo: item.repo, branch: item.branch, path: item.filePath });
  return (
    <SwipeableListItem
      itemId={item.id}
      selected={selected}
      selectionMode={selectionMode}
      onToggleSelect={onToggleSelect}
      disabled={lock.locked}
    >
      <View style={{ opacity: lock.locked ? 0.45 : 1, position: 'relative' }}>
        <TodoCard todo={item} onPress={onPress} onToggle={onToggle} />
        {lock.locked ? (
          <ActivityIndicator
            size="small"
            testID="todo-row.lock-spinner"
            color={colors.primary}
            style={{ position: 'absolute', right: 16, top: 16, zIndex: 5 }}
          />
        ) : null}
      </View>
    </SwipeableListItem>
  );
}

export default function TodoListScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const navigation = useNavigation();
  const { todos, createTodo, updateTodo, toggleTodo } = useTodos();
  const deleteTodo = useTodoStore((state) => state.deleteTodo);
  const { activeAccountId } = useAuth();
  const { repositories } = useRepos();
  const { columnCount } = useResponsive('list');

  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const [gitOperationActive, setGitOperationActive] = useState(false);

  const [bannerRegionHeight, setBannerRegionHeight] = useState(headerHeight);
  const [toolsHeight, setToolsHeight] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [todoText, setTodoText] = useState('');
  const [todoNotes, setTodoNotes] = useState('');
  const [todoPriority, setTodoPriority] = useState<TodoPriority>('medium');
  const [todoDueDate, setTodoDueDate] = useState<number | undefined>(undefined);
  const [todoReminderMinutes, setTodoReminderMinutes] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [filterCompleted, setFilterCompleted] = useState(false);
  const [filterCompletedHydrated, setFilterCompletedHydrated] = useState(false);
  const [todoRepo, setTodoRepo] = useState<string | undefined>(undefined);
  const [todoBranch, setTodoBranch] = useState<string | undefined>(undefined);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const isDeletingRef = useRef(false);

  useEffect(() => {
    if (!showAddModal) return;
    if (todoRepo) return;
    void LastSelectionPreferenceService.get('todo').then((sel) => {
      if (!todoRepo && sel.repo) setTodoRepo(sel.repo);
      if (!todoBranch && sel.branch) setTodoBranch(sel.branch);
    });
  }, [showAddModal, todoRepo, todoBranch]);

  const filter = useEntityFilter<Todo>(todos, '@gitnotes:filters:todo-entity');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const selectionMode = selectedIds.size > 0;
  const isFocused = useIsFocused();
  const { inflight } = useGitHubActivityStore();

  // GitSyncGate publishes registry ops for the held cycle (kind 'pull')
  // and push markers (kind 'push'); the registry is the reactive busy source.
  const gateBusy = useGitOperationStore((s) =>
    Object.values(s.ops).some(
      (op) =>
        (op.status === 'queued' || op.status === 'running') &&
        (op.kind === 'pull' || op.kind === 'push'),
    ),
  );

  // Reset refresh state when screen loses focus (tab switch, stack push, etc.)
  useEffect(() => {
    if (!isFocused) {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [isFocused]);

  useEffect(() => {
    AsyncStorage.getItem(FILTER_COMPLETED_PERSISTENCE_KEY)
      .then((raw) => {
        if (raw === 'true') setFilterCompleted(true);
      })
      .finally(() => setFilterCompletedHydrated(true));
  }, []);

  useEffect(() => {
    if (!filterCompletedHydrated) return;
    AsyncStorage.setItem(FILTER_COMPLETED_PERSISTENCE_KEY, String(filterCompleted)).catch(() => {});
  }, [filterCompleted, filterCompletedHydrated]);

  useEffect(() => {
    if (inflight > 0) {
      setGitOperationActive(true);
      return;
    }
    const timer = setTimeout(() => {
      setGitOperationActive(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [inflight]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const todosAfterEntityFilters = useMemo(() => {
    const baseTodos = filter.applyFilters(todos);
    return filterCompleted ? baseTodos.filter((todo) => !todo.completed) : baseTodos;
  }, [filter, filterCompleted, todos]);

  const {
    filteredData: filteredTodos,
    searchQuery,
    setSearchQuery,
    sortMode,
    setSortMode,
  } = useEntityList<Todo>({
    data: todosAfterEntityFilters,
    searchFields: ['text', 'notes', 'tags'],
    sortFn: (a, b, mode: SortMode) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const dir = mode.direction === 'asc' ? 1 : -1;
      switch (mode.field) {
        case 'modified':
          return dir * (a.updatedAt - b.updatedAt);
        case 'created':
          return dir * (a.createdAt - b.createdAt);
        case 'title':
          return dir * a.text.localeCompare(b.text);
      }
    },
    entityName: 'todo',
    persistenceKey: '@gitnotes:filters:todo-list',
  });

  const runApiBatchDeletes = useCallback(async (batchable: Todo[], failedIds: Set<string>) => {
    const branchByHintKey = new Map<string, string>();
    const groups = new Map<string, { repo: string; branch: string; todos: Todo[] }>();
    for (const todo of batchable) {
      const hintKey = `${todo.repo}\n${todo.branch ?? ''}`;
      if (!branchByHintKey.has(hintKey)) {
        branchByHintKey.set(hintKey, await resolveBranch(todo.repo!, todo.branch));
      }
      const branch = branchByHintKey.get(hintKey)!;
      const groupKey = `${todo.repo}\n${branch}`;
      const group = groups.get(groupKey) ?? { repo: todo.repo!, branch, todos: [] };
      group.todos.push(todo);
      groups.set(groupKey, group);
    }

    for (const group of groups.values()) {
      const repoInfo = parseRepoPath(group.repo);
      if (!repoInfo || group.todos.length < 2) {
        for (const todo of group.todos) {
          try {
            const ok = await deleteTodo(todo.id);
            if (!ok) failedIds.add(todo.id);
          } catch {
            failedIds.add(todo.id);
          }
        }
        continue;
      }

      const opByTodoId = new Map<string, string>();
      for (const todo of group.todos) {
        opByTodoId.set(todo.id, gitOperationRegistry.begin({
          kind: 'delete',
          repo: todo.repo!,
          branch: todo.branch,
          path: todo.filePath!,
          entityIds: [todo.id],
          status: 'running',
          attempts: 0,
        }));
      }

      let result;
      try {
        result = await batchDeleteFiles({
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          branch: group.branch,
          paths: group.todos.map((todo) => todo.filePath!),
          message: `Delete ${group.todos.length} todos`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result = {
          success: false,
          deleted: [] as string[],
          failed: group.todos.map((todo) => ({ path: todo.filePath!, error: message })),
        };
      }

      // Remote-first (#489): local rows disappear ONLY for paths the batch
      // actually deleted; failures keep their rows plus the store error state.
      const deletedPaths = new Set(result.deleted);
      const removedIds: string[] = [];
      for (const todo of group.todos) {
        const opId = opByTodoId.get(todo.id);
        if (!deletedPaths.has(todo.filePath!)) {
          failedIds.add(todo.id);
          if (opId) gitOperationRegistry.fail(opId, result.failed[0]?.error ?? t('sync.deleteFailed'));
          continue;
        }
        try {
          if (await StorageService.deleteTodo(todo.id)) {
            removedIds.push(todo.id);
            if (opId) gitOperationRegistry.succeed(opId);
          } else {
            failedIds.add(todo.id);
            if (opId) gitOperationRegistry.fail(opId, t('todos.deleteFailedLocally'));
          }
        } catch {
          failedIds.add(todo.id);
          if (opId) gitOperationRegistry.fail(opId, t('todos.deleteFailedLocally'));
        }
      }
      if (removedIds.length > 0) {
        const removedSet = new Set(removedIds);
        useTodoStore.setState((state) => ({
          todos: state.todos.filter((todo) => !removedSet.has(todo.id)),
        }));
      }
      if (result.failed.length > 0) {
        console.warn('[TodoList] bulk delete failed for paths:', result.failed);
        useTodoStore.setState({ error: formatSyncError(result.failed[0].error, 'delete') });
      }
    }
  }, [deleteTodo, t]);

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (isDeletingRef.current) return;
    const noun = ids.length === 1 ? t('todos.todo') : t('todos.todos_');
    Alert.alert(
      t('todos.deleteBulkConfirm', { count: ids.length, noun }),
      t('common.cannotBeUndone'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (isDeletingRef.current) return;
            isDeletingRef.current = true;
            const failedIds = new Set<string>();
            try {
              const selectedTodos = todos.filter((todo) => selectedIds.has(todo.id));
              const batchable: Todo[] = [];
              const perItem: Todo[] = [];
              for (const todo of selectedTodos) {
                if (!todo.repo || !todo.filePath) {
                  perItem.push(todo);
                  continue;
                }
                const mode = await SyncEngineService.getMode(todo.repo);
                if (mode === 'api') batchable.push(todo);
                else perItem.push(todo);
              }
              for (const todo of perItem) {
                try {
                  const ok = await deleteTodo(todo.id);
                  if (!ok) failedIds.add(todo.id);
                } catch {
                  failedIds.add(todo.id);
                }
              }
              await runApiBatchDeletes(batchable, failedIds);
              if (failedIds.size > 0) {
                HapticService.warning();
              } else {
                HapticService.success();
                clearSelection();
              }
            } finally {
              isDeletingRef.current = false;
            }
          },
        },
      ],
    );
  }, [selectedIds, todos, deleteTodo, clearSelection, runApiBatchDeletes, t]);

  const resetForm = useCallback(() => {
    setTodoText('');
    setTodoNotes('');
    setTodoPriority('medium');
    setTodoDueDate(undefined);
    setTodoReminderMinutes(0);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setShowReminderPicker(false);
    setTodoRepo(undefined);
    setTodoBranch(undefined);
  }, []);

  const handleAddTodo = useCallback(async () => {
    if (!todoText.trim()) {
      Alert.alert(t('common.error'), t('todos.errorTextRequired'));
      return;
    }

    if (!todoRepo) {
      Alert.alert(t('todos.repositoryRequired'), t('todos.selectRepository'));
      return;
    }

    const slug = slugifyTodoText(todoText.trim());
    const todoFilePath = `todos/${slug}.json`;

    const newTodo = await createTodo({
      text: todoText.trim(),
      notes: todoNotes.trim() || undefined,
      priority: todoPriority,
      dueDate: todoDueDate,
      reminderBeforeMinutes: todoDueDate ? todoReminderMinutes : undefined,
      repo: todoRepo,
      branch: todoBranch,
      filePath: todoFilePath,
      accountId: activeAccountId ?? undefined,
    });

    if (todoRepo && newTodo) {
      if (FEATURE_STAGE_PUSH) {
        const stageResult = await StagingService.stageUpsert({
          repo: todoRepo,
          branch: todoBranch,
          filePath: todoFilePath,
          title: todoText.trim(),
          content: serializeTodoForStage(newTodo),
        });
        if (!stageResult.success) {
          console.warn('[TodoList] GitHub stage failed:', stageResult.error);
        }
      } else {
        const syncResult = await syncTodoToGitHub({
          repo: todoRepo,
          branch: todoBranch,
          filePath: todoFilePath,
          text: todoText.trim(),
          todo: newTodo,
          accountId: newTodo.accountId,
        });
        if (!syncResult.success) {
          console.warn('[TodoList] GitHub sync failed:', syncResult.error);
        }
      }
    }

    resetForm();
    setShowAddModal(false);
    HapticService.success();
  }, [
    activeAccountId,
    createTodo,
    resetForm,
    todoBranch,
    todoDueDate,
    todoNotes,
    todoPriority,
    todoReminderMinutes,
    todoRepo,
    todoText,
  ]);

  const handleUpdateTodo = useCallback(async () => {
    if (!editingTodo || !todoText.trim()) return;

    if (!todoRepo) {
      Alert.alert(t('todos.repositoryRequired'), t('todos.selectRepository'));
      return;
    }

    const slug = slugifyTodoText(todoText.trim());
    const todoFilePath = editingTodo.filePath ?? `todos/${slug}.json`;
    const editAccountId = editingTodo.accountId ?? activeAccountId ?? undefined;

    await updateTodo({
      id: editingTodo.id,
      text: todoText.trim(),
      notes: todoNotes.trim() || undefined,
      priority: todoPriority,
      dueDate: todoDueDate,
      reminderBeforeMinutes: todoDueDate ? todoReminderMinutes : undefined,
      repo: todoRepo,
      branch: todoBranch,
      filePath: todoFilePath,
      accountId: editAccountId,
    });

    if (FEATURE_STAGE_PUSH) {
      const stageResult = await StagingService.stageUpsert({
        repo: todoRepo,
        branch: todoBranch,
        filePath: todoFilePath,
        title: todoText.trim(),
        content: serializeTodoForStage({
          text: todoText.trim(),
          completed: editingTodo.completed,
          priority: todoPriority,
          notes: todoNotes.trim() || undefined,
          tags: editingTodo.tags,
          dueDate: todoDueDate,
          createdAt: editingTodo.createdAt,
          updatedAt: Date.now(),
        }),
      });
      if (!stageResult.success) {
        console.warn('[TodoList] GitHub stage failed:', stageResult.error);
      }
    } else {
      const syncResult = await syncTodoToGitHub({
        repo: todoRepo,
        branch: todoBranch,
        filePath: todoFilePath,
        text: todoText.trim(),
        todo: {
          text: todoText.trim(),
          completed: editingTodo.completed,
          priority: todoPriority,
          notes: todoNotes.trim() || undefined,
          tags: editingTodo.tags,
          dueDate: todoDueDate,
          createdAt: editingTodo.createdAt,
          updatedAt: Date.now(),
        },
        accountId: editAccountId,
      });
      if (!syncResult.success) {
        console.warn('[TodoList] GitHub sync failed:', syncResult.error);
      }
    }

    resetForm();
    setEditingTodo(null);
  }, [
    activeAccountId,
    editingTodo,
    resetForm,
    todoBranch,
    todoDueDate,
    todoNotes,
    todoPriority,
    todoReminderMinutes,
    todoRepo,
    todoText,
    updateTodo,
    t,
  ]);

  const handleToggleTodo = useCallback(async (id: string) => {
    await toggleTodo(id);
    HapticService.light();
  }, [toggleTodo]);

  const openEditModal = useCallback((todo: Todo) => {
    setEditingTodo(todo);
    setTodoText(todo.text);
    setTodoNotes(todo.notes || '');
    setTodoPriority(todo.priority || 'medium');
    setTodoDueDate(todo.dueDate);
    setTodoReminderMinutes(todo.reminderBeforeMinutes ?? 0);
    setTodoRepo(todo.repo);
    setTodoBranch(todo.branch);
  }, []);

  const closeModals = useCallback(() => {
    setShowAddModal(false);
    setEditingTodo(null);
    resetForm();
  }, [resetForm]);

  const onDateChange = useCallback((_event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      const current = todoDueDate ? new Date(todoDueDate) : new Date();
      const updated = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        current.getHours(),
        current.getMinutes(),
      );
      setTodoDueDate(updated.getTime());
    }
  }, [todoDueDate]);

  const onTimeChange = useCallback((_event: any, selectedDate?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedDate && todoDueDate) {
      const base = new Date(todoDueDate);
      base.setHours(selectedDate.getHours(), selectedDate.getMinutes());
      setTodoDueDate(base.getTime());
    }
  }, [todoDueDate]);

  const removeDueDate = useCallback(() => {
    setTodoDueDate(undefined);
    setTodoReminderMinutes(0);
  }, []);

  const handlePullToRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    if (useGitHubActivityStore.getState().inflight > 0) return;
    if (GitSyncGate.isCycleHeld()) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    HapticService.light();

    const safetyTimeout = setTimeout(() => {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }, 30000);

    try {
      // Do NOT acquire the gate cycle here: syncNow acquires it internally,
      // and a held cycle would deadlock its own acquisition.
      await syncNow();
    } finally {
      clearTimeout(safetyTimeout);
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  const renderTodoItem = useCallback(
    ({ item }: { item: Todo }) => (
      <LockedTodoRow
        item={item}
        selected={selectedIds.has(item.id)}
        selectionMode={selectionMode}
        onToggleSelect={() => toggleSelected(item.id)}
        onPress={openEditModal}
        onToggle={handleToggleTodo}
      />
    ),
    [
      handleToggleTodo,
      openEditModal,
      selectedIds,
      selectionMode,
      toggleSelected,
    ],
  );

  const hasActiveFilters = filter.activeCount > 0 || !!searchQuery.trim() || filterCompleted;

  const activeFilterChips: FilterChip[] = useMemo(() => {
    const chips: FilterChip[] = [];
    if (filterCompleted) {
      chips.push({ id: 'status-active', label: t('todos.activeOnly'), type: 'status' });
    }
    for (const tag of filter.state.selectedTags) {
      chips.push({ id: `tag-${tag}`, label: tag, type: 'tag' });
    }
    if (filter.state.selectedRepo) {
      chips.push({ id: 'repo', label: filter.state.selectedRepo.name, type: 'folder' });
    }
    if (filter.state.selectedBranch) {
      chips.push({ id: 'branch', label: filter.state.selectedBranch, type: 'folder' });
    }
    if (filter.state.selectedFolder) {
      chips.push({ id: 'folder', label: filter.state.selectedFolder, type: 'folder' });
    }
    return chips;
  }, [filterCompleted, filter.state, filter.state.selectedTags, filter.state.selectedRepo, filter.state.selectedBranch, filter.state.selectedFolder, t]);

  const handleRemoveTodoFilterChip = useCallback(
    (id: string) => {
      if (id === 'status-active') setFilterCompleted(false);
      else if (id === 'repo') filter.setSelectedRepo(null);
      else if (id === 'branch') filter.setSelectedBranch(null);
      else if (id === 'folder') filter.setSelectedFolder(null);
      else if (id.startsWith('tag-')) filter.toggleTag(id.slice(4));
    },
    [filter],
  );

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: colors.background }}>
      <View
        testID="todos-list.banner-region"
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingTop: headerHeight }}
        onLayout={(event) => setBannerRegionHeight(event.nativeEvent.layout.height)}
      >
        <OfflineBanner />
        <ConflictBanner />
      </View>

      <EntityFilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filter={filter}
        repositories={repositories}
      />

      <FlatList
        data={filteredTodos}
        renderItem={renderTodoItem}
        keyExtractor={(item) => item.id}
        numColumns={columnCount}
        key={`todos-${columnCount}`}
        extraData={filteredTodos}
        removeClippedSubviews={false}
        contentContainerStyle={{
          padding: 16,
          paddingTop: bannerRegionHeight + toolsHeight + 8,
          paddingBottom: tabBarHeight + 16,
          flexGrow: 1,
        }}
        columnWrapperStyle={columnCount > 1 ? { gap: 8 } : undefined}
        ListEmptyComponent={<TodosEmptyState isFiltered={hasActiveFilters} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          gitOperationActive ? undefined : (
            <RefreshControl
              testID="todo-list.swipe.pull-refresh"
              refreshing={isRefreshing}
              onRefresh={handlePullToRefresh}
              enabled={!gateBusy}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          )
        }
      />

      <BlurView
        testID="todos-list.header-blur"
        pointerEvents="box-none"
        intensity={60}
        tint={isDark ? 'dark' : 'light'}
        className="absolute left-0 right-0 z-10"
        style={{ top: bannerRegionHeight }}
        onLayout={(event) => setToolsHeight(event.nativeEvent.layout.height)}
      >
        <TodosListHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} sortMode={sortMode} onSortChange={setSortMode} />

        <FilterBar
          filters={activeFilterChips}
          onRemoveFilter={handleRemoveTodoFilterChip}
          onClearAll={() => {
            filter.clearAll();
            setFilterCompleted(false);
          }}
        />
      </BlurView>

      <TodoEditorModal
        visible={showAddModal || editingTodo !== null}
        editingTodo={editingTodo}
        todoText={todoText}
        todoNotes={todoNotes}
        todoPriority={todoPriority}
        todoDueDate={todoDueDate}
        todoReminderMinutes={todoReminderMinutes}
        showDatePicker={showDatePicker}
        showTimePicker={showTimePicker}
        showReminderPicker={showReminderPicker}
        todoRepo={todoRepo}
        todoBranch={todoBranch}
        isDark={isDark}
        onClose={closeModals}
        onChangeText={setTodoText}
        onChangeNotes={setTodoNotes}
        onChangePriority={setTodoPriority}
        onToggleDatePicker={() => {
          setShowDatePicker(!showDatePicker);
          setShowTimePicker(false);
        }}
        onToggleTimePicker={() => {
          setShowTimePicker(!showTimePicker);
          setShowDatePicker(false);
        }}
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
        onAddDeadline={() => {
          setTodoDueDate(Date.now() + 3600000);
          setShowDatePicker(true);
        }}
        onRemoveDeadline={removeDueDate}
        onToggleReminderPicker={() => setShowReminderPicker((previous) => !previous)}
        onSelectReminderMinutes={(minutes) => {
          setTodoReminderMinutes(minutes);
          setShowReminderPicker(false);
        }}
        onRepoChange={setTodoRepo}
        onBranchChange={setTodoBranch}
        onSubmit={editingTodo ? handleUpdateTodo : handleAddTodo}
      />

      <BulkActionBar
        count={selectedIds.size}
        itemNoun={t('todos.todo')}
        bottomOffset={tabBarHeight + 12}
        onCancel={clearSelection}
        onDelete={handleBulkDelete}
      />

      <ScreenHeader
        title={t('todos.title')}
        actions={
          <>
            <IconButton
              size="sm"
              testID="todo-list.icon-button.filter-completed"
              active={filterCompleted}
              onPress={() => setFilterCompleted(!filterCompleted)}
              accessibilityLabel={t('todos.toggleCompletedA11y')}
            >
              <Ionicons
                name={filterCompleted ? 'eye-off' : 'eye'}
                size={18}
                color={filterCompleted ? colors.accent : colors.textSecondary}
              />
            </IconButton>
            <IconButton
              size="sm"
              testID="todo-list.icon-button.filters"
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
            <IconButton
              size="sm"
              testID="todo-list.icon-button.add"
              onPress={() => {
                if (!requireRepo(repositories.length > 0, {
                  kind: 'todo',
                  onOpenSettings: () => navigation.navigate('MainTabs', { screen: 'SettingsTab' }),
                })) {
                  return;
                }
                setShowAddModal(true);
              }}
              accessibilityLabel={t('todos.addTodoA11y')}
            >
              <Ionicons name="add" size={20} color={colors.accent} />
            </IconButton>
          </>
        }
      />
    </SafeAreaView>
  );
}
