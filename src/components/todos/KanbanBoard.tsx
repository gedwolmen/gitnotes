import React, { useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useTodos } from '../../contexts/TodoContext';
import { Todo } from '../../models/Todo';
import { Ionicons } from '@expo/vector-icons';

type ColumnKey = 'todo' | 'in-progress' | 'done';

const COLUMNS: { key: ColumnKey; label: string; color: string }[] = [
  { key: 'todo', label: 'To Do', color: '#FF9500' },
  { key: 'in-progress', label: 'In Progress', color: '#007AFF' },
  { key: 'done', label: 'Done', color: '#34C759' },
];

function deriveStatus(todo: Todo): ColumnKey {
  if (todo.completed) return 'done';
  if (todo.dueDate && todo.dueDate - Date.now() < 7 * 24 * 60 * 60 * 1000) return 'in-progress';
  return 'todo';
}

interface KanbanColumnProps {
  column: typeof COLUMNS[0];
  todos: Todo[];
  onPress: (todo: Todo) => void;
}

function KanbanColumn({ column, todos, onPress }: KanbanColumnProps) {
  const { colors } = useTheme();

  return (
    <View style={{ width: 280, marginRight: 12 }}>
      <View style={{
        backgroundColor: column.color + '20',
        borderRadius: 8,
        padding: 8,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
      }}>
        <View style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: column.color,
          marginRight: 8
        }} />
        <Text style={{ fontWeight: '600', color: colors.text }}>
          {column.label}
        </Text>
        <Text style={{
          marginLeft: 'auto',
          color: colors.textSecondary,
          fontSize: 12
        }}>
          {todos.length}
        </Text>
      </View>

      {todos.map(todo => (
        <TouchableOpacity
          key={todo.id}
          onPress={() => onPress(todo)}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 8,
            padding: 12,
            marginBottom: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text }} numberOfLines={2}>
            {todo.text}
          </Text>
          {todo.dueDate && (
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
              Due: {new Date(todo.dueDate).toLocaleDateString()}
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

interface KanbanBoardProps {
  onSelect?: (todo: Todo) => void;
}

export default function KanbanBoard({ onSelect }: KanbanBoardProps) {
  const { todos } = useTodos();
  const { colors } = useTheme();

  const todosByColumn = useMemo(() => {
    const map: Record<ColumnKey, Todo[]> = { 'todo': [], 'in-progress': [], 'done': [] };
    for (const todo of todos) {
      const col = deriveStatus(todo);
      map[col].push(todo);
    }
    return map;
  }, [todos]);

  const handlePress = useCallback((todo: Todo) => {
    onSelect?.(todo);
  }, [onSelect]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16 }}
    >
      {COLUMNS.map(col => (
        <KanbanColumn
          key={col.key}
          column={col}
          todos={todosByColumn[col.key]}
          onPress={handlePress}
        />
      ))}
    </ScrollView>
  );
}
