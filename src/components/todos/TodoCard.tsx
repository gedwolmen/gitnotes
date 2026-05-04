import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { isPast } from 'date-fns';

import { useTheme } from '../../contexts/ThemeContext';
import { PRIORITY_COLORS, PRIORITY_LABELS, Todo } from '../../models/Todo';
import { TodosSwipeActions } from './TodosSwipeActions';
import { findReminderLabel, formatDeadline } from './todosShared';

interface TodoCardProps {
  todo: Todo;
  swipeableRef: React.RefObject<SwipeableMethods | null>;
  onSwipeableWillOpen: () => void;
  onSwipeableWillClose: () => void;
  onDelete: () => void;
  onPress: (todo: Todo) => void;
  onToggle: (id: string) => void;
}

function TodoCardImpl({
  todo,
  swipeableRef,
  onSwipeableWillOpen,
  onSwipeableWillClose,
  onDelete,
  onPress,
  onToggle,
}: TodoCardProps) {
  const { colors } = useTheme();
  const isOverdue = todo.dueDate ? isPast(new Date(todo.dueDate)) && !todo.completed : false;

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      onSwipeableWillOpen={onSwipeableWillOpen}
      onSwipeableWillClose={onSwipeableWillClose}
      renderRightActions={() => <TodosSwipeActions onDelete={onDelete} />}
      overshootRight={false}
    >
      <TouchableOpacity
        style={[
          styles.todoItem,
          { backgroundColor: colors.surface, borderColor: isOverdue ? colors.error : colors.border },
          isOverdue && { borderWidth: 1.5 },
        ]}
        onPress={() => onPress(todo)}
        onLongPress={() => onToggle(todo.id)}
      >
        <TouchableOpacity
          style={[styles.checkbox, { borderColor: todo.completed ? colors.primary : colors.border }]}
          onPress={() => onToggle(todo.id)}
        >
          {todo.completed ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
        </TouchableOpacity>

        <View style={styles.todoContent}>
          <Text
            style={[styles.todoText, { color: todo.completed ? colors.textSecondary : colors.text }]}
            numberOfLines={2}
          >
            {todo.text}
          </Text>

          {todo.notes ? (
            <Text style={[styles.todoNotes, { color: colors.textSecondary }]} numberOfLines={1}>
              {todo.notes}
            </Text>
          ) : null}

          <View style={styles.todoMeta}>
            {todo.priority ? (
              <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[todo.priority] + '20' }]}>
                <Text style={[styles.priorityText, { color: PRIORITY_COLORS[todo.priority] }]}>
                  {PRIORITY_LABELS[todo.priority]}
                </Text>
              </View>
            ) : null}

            {isOverdue ? (
              <View style={[styles.expiredBadge, { backgroundColor: colors.error }]}>
                <Text style={styles.expiredText}>EXPIRED</Text>
              </View>
            ) : null}

            {todo.dueDate ? (
              <View
                style={[
                  styles.deadlineBadge,
                  { backgroundColor: isOverdue ? colors.error + '20' : colors.primary + '15' },
                ]}
              >
                <Ionicons
                  name={isOverdue ? 'alert-circle' : 'time-outline'}
                  size={12}
                  color={isOverdue ? colors.error : colors.primary}
                />
                <Text style={[styles.deadlineText, { color: isOverdue ? colors.error : colors.primary }]}>
                  {formatDeadline(todo.dueDate)}
                </Text>
              </View>
            ) : null}

            {todo.dueDate && todo.reminderBeforeMinutes !== undefined && todo.reminderBeforeMinutes > 0 ? (
              <View style={styles.reminderBadge}>
                <Ionicons name="notifications-outline" size={11} color="#FF9500" />
                <Text style={styles.reminderBadgeText}>
                  {findReminderLabel(todo.reminderBeforeMinutes)}
                </Text>
              </View>
            ) : null}

            {todo.tags && todo.tags.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsContainer}>
                {todo.tags.slice(0, 3).map((tag) => (
                  <View key={tag} style={[styles.tagBadge, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        </View>

        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </ReanimatedSwipeable>
  );
}

export const TodoCard = memo(TodoCardImpl, (prev, next) => {
  return (
    prev.todo === next.todo &&
    prev.swipeableRef === next.swipeableRef &&
    prev.onSwipeableWillOpen === next.onSwipeableWillOpen &&
    prev.onSwipeableWillClose === next.onSwipeableWillClose &&
    prev.onDelete === next.onDelete &&
    prev.onPress === next.onPress &&
    prev.onToggle === next.onToggle
  );
});

const styles = StyleSheet.create({
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
  expiredBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginRight: 6,
  },
  expiredText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
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
    backgroundColor: '#FF950020',
  },
  reminderBadgeText: {
    color: '#FF9500',
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
});
