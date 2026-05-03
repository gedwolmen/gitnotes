import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, isToday, isTomorrow, isPast } from 'date-fns';

import { useTodos } from '../contexts/TodoContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Todo, TodoPriority, PRIORITY_COLORS, PRIORITY_LABELS, REMINDER_OPTIONS, slugifyTodoText, reorderTodos } from '../models/Todo';
import { HapticService } from '../utils/haptics';
import { useResponsive } from '../hooks/useResponsive';
import GitContextPicker from '../components/GitContextPicker';
import { syncTodoToGitHub } from '../services/TodoGitHubSyncService';
import { pullAllFromRepos } from '../services/RepoPullService';
import { IconButton, ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import SearchBar from '../components/SearchBar';
import { EntityFilterModal } from '../components/EntityFilterModal';
import { ActiveFilterStrip } from '../components/ActiveFilterStrip';
import { useEntityFilter } from '../hooks/useEntityFilter';
import { useRepos } from '../contexts/RepoContext';
import { useTodoStore } from '../stores/todoStore';

function formatDeadline(timestamp: number): string {
  const date = new Date(timestamp);
  const timeStr = format(date, 'h:mm a');
  if (isToday(date)) return `Today ${timeStr}`;
  if (isTomorrow(date)) return `Tomorrow ${timeStr}`;
  return `${format(date, 'MMM d')} ${timeStr}`;
}

function findReminderLabel(minutes: number): string {
  return REMINDER_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `${minutes} min before`;
}

export default function TodoListScreen() {
  const { colors, isDark } = useTheme();
  const { isTablet, maxContentWidth } = useResponsive();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const { todos, createTodo, updateTodo, toggleTodo, refreshTodos } = useTodos();
  const deleteTodo = useTodoStore((state) => state.deleteTodo);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const { activeAccountId } = useAuth();
  const [todoText, setTodoText] = useState('');
  const [todoNotes, setTodoNotes] = useState('');
  const [todoPriority, setTodoPriority] = useState<TodoPriority>('medium');
  const [todoDueDate, setTodoDueDate] = useState<number | undefined>(undefined);
  const [todoReminderMinutes, setTodoReminderMinutes] = useState<number>(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const modalScrollRef = useRef<ScrollView>(null);
  const [filterCompleted, setFilterCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [todoRepo, setTodoRepo] = useState<string | undefined>(undefined);
  const [todoBranch, setTodoBranch] = useState<string | undefined>(undefined);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const { repositories } = useRepos();
  const filter = useEntityFilter<Todo>(todos);

  const filteredTodos = useMemo(() => {
    let filtered = filter.applyFilters(todos);

    if (filterCompleted) {
      filtered = filtered.filter(todo => !todo.completed);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        todo =>
          todo.text.toLowerCase().includes(query) ||
          (todo.notes && todo.notes.toLowerCase().includes(query)) ||
          (todo.tags && todo.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

    return reorderTodos(filtered);
  }, [todos, filter, filterCompleted, searchQuery]);

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
  }, [todoText, todoNotes, todoPriority, todoDueDate, todoReminderMinutes, todoRepo, todoBranch, createTodo, resetForm]);

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
  }, [editingTodo, todoText, todoNotes, todoPriority, todoDueDate, todoReminderMinutes, todoRepo, todoBranch, updateTodo, resetForm]);

  const handleToggleTodo = useCallback(async (id: string) => {
    await toggleTodo(id);
    HapticService.light();
  }, [toggleTodo]);

  const handleDeleteTodo = useCallback(async (id: string) => {
    Alert.alert(
      'Delete Todo',
      'Are you sure you want to delete this todo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTodo(id);
            HapticService.light();
          },
        },
      ]
    );
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
    ({ item }: { item: Todo }) => {
      const renderRightActions = () => (
        <TouchableOpacity
          style={[styles.deleteAction, { backgroundColor: colors.error }]}
          onPress={() => handleDeleteTodo(item.id)}
        >
          <Ionicons name="trash" size={24} color="#fff" />
        </TouchableOpacity>
      );

      const isOverdue = item.dueDate ? isPast(new Date(item.dueDate)) && !item.completed : false;

      return (
        <ReanimatedSwipeable renderRightActions={renderRightActions} overshootRight={false}>
          <TouchableOpacity
            style={[
              styles.todoItem,
              { backgroundColor: colors.surface, borderColor: isOverdue ? colors.error : colors.border },
              isOverdue && { borderWidth: 1.5 },
            ]}
            onPress={() => openEditModal(item)}
            onLongPress={() => handleToggleTodo(item.id)}
          >
            <TouchableOpacity
              style={[styles.checkbox, { borderColor: item.completed ? colors.primary : colors.border }]}
              onPress={() => handleToggleTodo(item.id)}
            >
              {item.completed && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </TouchableOpacity>

            <View style={styles.todoContent}>
              <Text
                style={[styles.todoText, { color: item.completed ? colors.textSecondary : colors.text }]}
                numberOfLines={2}
              >
                {item.text}
              </Text>

              {item.notes && (
                <Text style={[styles.todoNotes, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.notes}
                </Text>
              )}

              <View style={styles.todoMeta}>
                {item.priority && (
                  <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[item.priority] + '20' }]}>
                    <Text style={[styles.priorityText, { color: PRIORITY_COLORS[item.priority] }]}>
                      {PRIORITY_LABELS[item.priority]}
                    </Text>
                  </View>
                )}

                {isOverdue && (
                  <View style={{
                    backgroundColor: colors.error,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 5,
                    marginRight: 6,
                  }}>
                    <Text style={{ color: '#ffffff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>
                      EXPIRED
                    </Text>
                  </View>
                )}

                {item.dueDate && (
                  <View style={[styles.deadlineBadge, { backgroundColor: isOverdue ? colors.error + '20' : colors.primary + '15' }]}>
                    <Ionicons
                      name={isOverdue ? 'alert-circle' : 'time-outline'}
                      size={12}
                      color={isOverdue ? colors.error : colors.primary}
                    />
                    <Text style={[styles.deadlineText, { color: isOverdue ? colors.error : colors.primary }]}>
                      {formatDeadline(item.dueDate)}
                    </Text>
                  </View>
                )}

                {item.dueDate && item.reminderBeforeMinutes !== undefined && item.reminderBeforeMinutes > 0 && (
                  <View style={[styles.reminderBadge, { backgroundColor: '#FF950020' }]}>
                    <Ionicons name="notifications-outline" size={11} color="#FF9500" />
                    <Text style={[styles.reminderBadgeText, { color: '#FF9500' }]}>
                      {findReminderLabel(item.reminderBeforeMinutes)}
                    </Text>
                  </View>
                )}

                {item.tags && item.tags.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsContainer}>
                    {item.tags.slice(0, 3).map((tag) => (
                      <View key={tag} style={[styles.tagBadge, { backgroundColor: colors.primary + '20' }]}>
                        <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>

            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </ReanimatedSwipeable>
      );
    },
    [colors, handleToggleTodo, handleDeleteTodo, openEditModal]
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="checkbox-outline" size={64} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No todos yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        Tap the + button to add your first todo
      </Text>
    </View>
  );

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: colors.background }, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
      <View style={{ paddingTop: headerHeight }}>
        <OfflineBanner />
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search todos..."
        />
      </View>

      <ActiveFilterStrip filter={filter} />

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
        contentContainerStyle={{ ...styles.listContent, paddingBottom: tabBarHeight + 16 }}
        ListEmptyComponent={renderEmptyState}
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

      <Modal visible={showAddModal || editingTodo !== null} transparent animationType="slide" onRequestClose={closeModals}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingTodo ? 'Edit Todo' : 'New Todo'}
              </Text>
              <TouchableOpacity onPress={closeModals}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView ref={modalScrollRef} style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Todo Text *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                value={todoText}
                onChangeText={setTodoText}
                placeholder="What needs to be done?"
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />

              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Notes</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline, { color: colors.text, borderColor: colors.border }]}
                value={todoNotes}
                onChangeText={setTodoNotes}
                placeholder="Additional notes..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Priority</Text>
              <View style={styles.priorityContainer}>
                {(['low', 'medium', 'high'] as TodoPriority[]).map((priority) => (
                  <TouchableOpacity
                    key={priority}
                    style={[
                      styles.priorityOption,
                      { borderColor: colors.border },
                      todoPriority === priority && { borderColor: PRIORITY_COLORS[priority], backgroundColor: PRIORITY_COLORS[priority] + '15' },
                    ]}
                    onPress={() => setTodoPriority(priority)}
                  >
                    <Text style={[styles.priorityOptionText, { color: todoPriority === priority ? PRIORITY_COLORS[priority] : colors.textSecondary }]}>
                      {PRIORITY_LABELS[priority]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {todoDueDate ? (
                <View style={[styles.deadlineCard, { backgroundColor: colors.primary + '08', borderColor: colors.primary + '30' }]}>
                  <View style={styles.deadlineCardHeader}>
                    <View style={styles.deadlineCardLabel}>
                      <Ionicons name="calendar" size={15} color={colors.primary} />
                      <Text style={[styles.deadlineCardTitle, { color: colors.primary }]}>Deadline</Text>
                    </View>
                    <TouchableOpacity onPress={removeDueDate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.deadlineCardRow}>
                    <TouchableOpacity
                      style={[styles.deadlineSlot, { backgroundColor: colors.surface, borderColor: showDatePicker ? colors.primary : colors.primary + '40' }]}
                      onPress={() => { setShowDatePicker(!showDatePicker); setShowTimePicker(false); }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      <Text style={[styles.deadlineSlotText, { color: colors.text }]}>
                        {format(new Date(todoDueDate), 'EEE, MMM d')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.deadlineSlot, { backgroundColor: colors.surface, borderColor: showTimePicker ? colors.primary : colors.primary + '40' }]}
                      onPress={() => { setShowTimePicker(!showTimePicker); setShowDatePicker(false); }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="time-outline" size={16} color={colors.primary} />
                      <Text style={[styles.deadlineSlotText, { color: colors.text }]}>
                        {format(new Date(todoDueDate), 'h:mm a')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {showDatePicker && (
                    <View style={[styles.pickerWrapper, { backgroundColor: colors.surface }]}>
                      <DateTimePicker
                        value={new Date(todoDueDate)}
                        mode="date"
                        display="spinner"
                        onChange={onDateChange}
                        minimumDate={new Date()}
                        accentColor={colors.primary}
                        themeVariant={isDark ? 'dark' : 'light'}
                      />
                    </View>
                  )}
                  {showTimePicker && (
                    <View style={[styles.pickerWrapper, { backgroundColor: colors.surface }]}>
                      <DateTimePicker
                        value={new Date(todoDueDate)}
                        mode="time"
                        display="spinner"
                        onChange={onTimeChange}
                        accentColor={colors.primary}
                        themeVariant={isDark ? 'dark' : 'light'}
                      />
                    </View>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.addDeadlineButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => {
                    setTodoDueDate(Date.now() + 3600000);
                    setShowDatePicker(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.addDeadlineIcon, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.addDeadlineText, { color: colors.primary }]}>Set deadline</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              )}

              {todoDueDate && (
                <>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Remind me</Text>
                  <TouchableOpacity
                    style={[styles.reminderPickerButton, { borderColor: colors.border }]}
                    onPress={() => {
                      const next = !showReminderPicker;
                      setShowReminderPicker(next);
                      if (next) {
                        // Wait for the options to mount before scrolling.
                        requestAnimationFrame(() => {
                          modalScrollRef.current?.scrollToEnd({ animated: true });
                        });
                      }
                    }}
                  >
                    <Ionicons name="notifications-outline" size={16} color="#FF9500" />
                    <Text style={[styles.reminderPickerText, { color: colors.text }]}>
                      {findReminderLabel(todoReminderMinutes)}
                    </Text>
                    <Ionicons name={showReminderPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                  {showReminderPicker && (
                    <View style={[styles.reminderOptions, { borderColor: colors.border }]}>
                      {REMINDER_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={option.minutes}
                          style={[
                            styles.reminderOption,
                            todoReminderMinutes === option.minutes && { backgroundColor: '#FF950015' },
                          ]}
                          onPress={() => {
                            setTodoReminderMinutes(option.minutes);
                            setShowReminderPicker(false);
                          }}
                        >
                          <Text style={[
                            styles.reminderOptionText,
                            { color: todoReminderMinutes === option.minutes ? '#FF9500' : colors.text },
                          ]}>
                            {option.label}
                          </Text>
                          {todoReminderMinutes === option.minutes && (
                            <Ionicons name="checkmark" size={16} color="#FF9500" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

            </ScrollView>

            <View style={styles.gitContextContainer}>
              <GitContextPicker
                repo={todoRepo}
                branch={todoBranch}
                commit={undefined}
                onRepoChange={setTodoRepo}
                onBranchChange={setTodoBranch}
                onCommitChange={() => {}}
              />
            </View>

            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: colors.border }]}
                onPress={closeModals}
              >
                <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={editingTodo ? handleUpdateTodo : handleAddTodo}>
                <Text style={styles.saveButtonText}>{editingTodo ? 'Update' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <ScreenHeader
        title="Todos"
        actions={
          <>
            <IconButton
              size="sm"
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
            <IconButton size="sm" onPress={() => setShowAddModal(true)} accessibilityLabel="Add todo">
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterButton: {
    padding: 8,
  },
  addButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  todoContent: {
    flex: 1,
  },
  todoText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  todoNotes: {
    fontSize: 13,
    marginBottom: 6,
  },
  todoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  deadlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 3,
  },
  deadlineText: {
    fontSize: 11,
    fontWeight: '500',
  },
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 3,
  },
  reminderBadgeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 12,
    marginBottom: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 64,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalBody: {
    padding: 20,
  },
  gitContextContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  priorityOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  priorityOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  deadlineCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  deadlineCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deadlineCardLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deadlineCardTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  deadlineCardRow: {
    flexDirection: 'row',
    gap: 8,
  },
  deadlineSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 7,
  },
  deadlineSlotText: {
    fontSize: 14,
    fontWeight: '500',
  },
  removeDeadlineButton: {
    padding: 4,
    marginLeft: 8,
  },
  addDeadlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    gap: 10,
  },
  addDeadlineIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDeadlineText: {
    fontSize: 15,
    fontWeight: '500',
  },
  reminderPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    gap: 8,
  },
  reminderPickerText: {
    flex: 1,
    fontSize: 14,
  },
  reminderOptions: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  reminderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  reminderOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  pickerWrapper: {
    marginTop: 12,
    borderRadius: 10,
    alignItems: 'center',
    overflow: 'hidden',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
