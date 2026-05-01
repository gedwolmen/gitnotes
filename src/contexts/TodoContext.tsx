import React, { useEffect, useMemo } from 'react';
import { Todo, TodoCreateInput, TodoUpdateInput } from '../models/Todo';
import { StorageService } from '../services/StorageService';
import { NotificationService } from '../services/NotificationService';
import { useTodoStore } from '../stores/todoStore';

interface TodoContextValue {
  todos: Todo[];
  isLoading: boolean;
  createTodo: (input: TodoCreateInput) => Promise<Todo | null>;
  updateTodo: (input: TodoUpdateInput) => Promise<Todo | null>;
  deleteTodo: (id: string) => Promise<boolean>;
  toggleTodo: (id: string) => Promise<boolean>;
  refreshTodos: () => Promise<void>;
}

export function TodoProvider({ children }: { children: React.ReactNode }) {
  const loadTodos = useTodoStore((s) => s.loadTodos);
  const needsLoad = useTodoStore((s) => s.isLoading && s.todos.length === 0);

  useEffect(() => {
    if (needsLoad) loadTodos();
  }, [needsLoad, loadTodos]);

  return <>{children}</>;
}

export function useTodos(): TodoContextValue {
  const todos = useTodoStore((s) => s.todos);
  const isLoading = useTodoStore((s) => s.isLoading);

  const createTodo = useMemo(() => async (input: TodoCreateInput): Promise<Todo | null> => {
    try {
      const todo = await StorageService.createTodo(input);
      const notificationId = await NotificationService.scheduleReminder(todo);
      const finalTodo = notificationId
        ? await StorageService.updateTodo({ id: todo.id, notificationId }) ?? todo
        : todo;
      useTodoStore.setState((s) => ({ todos: [finalTodo, ...s.todos] }));
      return finalTodo;
    } catch {
      return null;
    }
  }, []);

  const updateTodo = useMemo(() => async (input: TodoUpdateInput): Promise<Todo | null> => {
    try {
      const updated = await StorageService.updateTodo(input);
      if (!updated) return null;
      const notificationId = await NotificationService.rescheduleReminder(updated);
      const finalTodo = notificationId !== updated.notificationId
        ? await StorageService.updateTodo({ id: updated.id, notificationId }) ?? updated
        : updated;
      useTodoStore.setState((s) => ({ todos: s.todos.map((t) => (t.id === finalTodo.id ? finalTodo : t)) }));
      return finalTodo;
    } catch {
      return null;
    }
  }, []);

  const deleteTodo = useMemo(() => async (id: string): Promise<boolean> => {
    try {
      const todo = useTodoStore.getState().todos.find((t) => t.id === id);
      if (todo) await NotificationService.cancelAllForTodo(todo);
      const ok = await StorageService.deleteTodo(id);
      if (ok) useTodoStore.setState((s) => ({ todos: s.todos.filter((t) => t.id !== id) }));
      return ok;
    } catch {
      return false;
    }
  }, []);

  const toggleTodo = useMemo(() => async (id: string): Promise<boolean> => {
    const todo = useTodoStore.getState().todos.find((t) => t.id === id);
    if (!todo) return false;
    const updated = await StorageService.updateTodo({ id, completed: !todo.completed });
    if (!updated) return false;
    if (updated.completed) {
      await NotificationService.cancelAllForTodo(updated);
    } else {
      const notificationId = await NotificationService.scheduleReminder(updated);
      if (notificationId && notificationId !== updated.notificationId) {
        const withNotification = await StorageService.updateTodo({ id, notificationId });
        useTodoStore.setState((s) => ({ todos: s.todos.map((t) => (t.id === id ? (withNotification ?? updated) : t)) }));
        return true;
      }
    }
    useTodoStore.setState((s) => ({ todos: s.todos.map((t) => (t.id === id ? updated : t)) }));
    return true;
  }, []);

  const refreshTodos = useTodoStore((s) => s.refreshTodos);

  return useMemo(
    () => ({ todos, isLoading, createTodo, updateTodo, deleteTodo, toggleTodo, refreshTodos }),
    [todos, isLoading, createTodo, updateTodo, deleteTodo, toggleTodo, refreshTodos],
  );
}
