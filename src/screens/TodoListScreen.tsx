import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Alert, Platform, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTodos } from '../contexts/TodoContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { slugifyTodoText, Todo, TodoPriority } from '../models/Todo';
import { SortMode } from '../types/SortTypes';
import { HapticService } from '../utils/haptics';
import { useResponsive } from '../hooks/useResponsive';
import { syncTodoToGitHub } from '../services/TodoGitHubSyncService';
import { pullAllFromRepos } from '../services/RepoPullService';
import { IconButton, ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { OfflineBanner } from '../components/ui/OfflineBanner';
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

export default function TodoListScreen() {
  const { colors, isDark } = useTheme();
  const { isTablet, maxContentWidth } = useResponsive();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const { todos, createTodo, updateTodo, toggleTodo, refreshTodos } = useTodos();
  const deleteTodo = useTodoStore((state) => state.deleteTodo);
  const { activeAccountId } = useAuth();
  const { repositories } = useRepos();

  const [isRefreshing, setIsRefreshing] = useState(false);
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
  const [todoRepo, setTodoRepo] = useState<string | undefined>(undefined);
  const [todoBranch, setTodoBranch] = useState<string | undefined>(undefined);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const swipeableRefs = useRef<Record<string, React.RefObject<SwipeableMethods | null>>>({});
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);
  const filter = useEntityFilter<Todo>(todos);

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
  });

  const todosListToken = useMemo(
    () => filteredTodos.map((t) => `${t.id}:${t.completed ? 1 : 0}`).join('|'),
    [filteredTodos],
  );

  const getSwipeableRef = useCallback((todoId: string) => {
    if (!swipeableRefs.current[todoId]) {
      swipeableRefs.current[todoId] = React.createRef<SwipeableMethods>();
    }
    return swipeableRefs.current[todoId];
  }, []);

  const handleSwipeableWillOpen = useCallback((todoId: string) => {
    const swipeable = swipeableRefs.current[todoId]?.current;
    if (openSwipeableRef.current && openSwipeableRef.current !== swipeable) {
      openSwipeableRef.current.close();
    }
    if (swipeable) {
      openSwipeableRef.current = swipeable;
    }
  }, []);

  const handleSwipeableWillClose = useCallback((todoId: string) => {
    const swipeable = swipeableRefs.current[todoId]?.current;
    if (openSwipeableRef.current === swipeable) {
      openSwipeableRef.current = null;
    }
  }, []);

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
      Alert.alert('Error', 'Please enter a todo text');
      return;
    }

    if (!todoRepo) {
      Alert.alert('Repository Required', 'Please select a repository before saving.');
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
      Alert.alert('Repository Required', 'Please select a repository before saving.');
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
  ]);

  const handleToggleTodo = useCallback(async (id: string) => {
    await toggleTodo(id);
    HapticService.light();
  }, [toggleTodo]);

  const handleDeleteTodo = useCallback(async (id: string) => {
    const swipeable = swipeableRefs.current[id]?.current;
    swipeable?.close();
    if (openSwipeableRef.current === swipeable) {
      openSwipeableRef.current = null;
    }

    Alert.alert('Delete Todo', 'Are you sure you want to delete this todo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const ok = await deleteTodo(id);
          delete swipeableRefs.current[id];
          HapticService.light();
          if (!ok) {
            const message = useTodoStore.getState().error ?? 'Could not delete todo. Please try again.';
            Alert.alert('Delete failed', message);
          }
        },
      },
    ]);
  }, [deleteTodo]);

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
    if (isRefreshing) return;
    setIsRefreshing(true);
    HapticService.light();
    try {
      await pullAllFromRepos();
    } catch (err) {
      console.warn('[TodoList] Pull failed:', err);
    } finally {
      await refreshTodos();
      setIsRefreshing(false);
    }
  }, [isRefreshing, refreshTodos]);

  const renderTodoItem = useCallback(
    ({ item }: { item: Todo }) => (
      <TodoCard
        todo={item}
        swipeableRef={getSwipeableRef(item.id)}
        onSwipeableWillOpen={() => handleSwipeableWillOpen(item.id)}
        onSwipeableWillClose={() => handleSwipeableWillClose(item.id)}
        onDelete={() => handleDeleteTodo(item.id)}
        onPress={openEditModal}
        onToggle={handleToggleTodo}
      />
    ),
    [
      getSwipeableRef,
      handleDeleteTodo,
      handleSwipeableWillClose,
      handleSwipeableWillOpen,
      handleToggleTodo,
      openEditModal,
    ],
  );

  const hasActiveFilters = filter.activeCount > 0 || !!searchQuery.trim() || filterCompleted;

  const activeFilterChips: FilterChip[] = useMemo(() => {
    const chips: FilterChip[] = [];
    if (filterCompleted) {
      chips.push({ id: 'status-active', label: 'Active only', type: 'status' });
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
  }, [filterCompleted, filter.state, filter.state.selectedTags, filter.state.selectedRepo, filter.state.selectedBranch, filter.state.selectedFolder]);

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
    <SafeAreaView
      edges={[]}
      style={[
        styles.container,
        { backgroundColor: colors.background },
        isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' },
      ]}
    >
      <View style={{ paddingTop: headerHeight }}>
        <OfflineBanner />
      </View>

      <TodosListHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} sortMode={sortMode} onSortChange={setSortMode} />

      <FilterBar
        filters={activeFilterChips}
        onRemoveFilter={handleRemoveTodoFilterChip}
        onClearAll={() => {
          filter.clearAll();
          setFilterCompleted(false);
        }}
      />

      <EntityFilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filter={filter}
        repositories={repositories}
      />

      <FlashList
        data={filteredTodos}
        renderItem={renderTodoItem}
        keyExtractor={(item) => item.id}
        extraData={todosListToken}
        contentContainerStyle={{ ...styles.listContent, paddingBottom: tabBarHeight + 16 }}
        ListEmptyComponent={<TodosEmptyState isFiltered={hasActiveFilters} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullToRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />

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

      <ScreenHeader
        title="Todos"
        actions={
          <>
            <IconButton
              size="sm"
              testID="todo-list.icon-button.filter-completed"
              active={filterCompleted}
              onPress={() => setFilterCompleted(!filterCompleted)}
              accessibilityLabel="Toggle completed filter"
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
              accessibilityLabel="Filters"
            >
              <Ionicons
                name="funnel-outline"
                size={18}
                color={filter.activeCount > 0 ? colors.accent : colors.textSecondary}
              />
            </IconButton>
            <IconButton size="sm" testID="todo-list.icon-button.add" onPress={() => setShowAddModal(true)} accessibilityLabel="Add todo">
              <Ionicons name="add" size={20} color={colors.accent} />
            </IconButton>
          </>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
});
