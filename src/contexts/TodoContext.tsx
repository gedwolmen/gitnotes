import React, { useEffect, useMemo } from 'react';
import { Todo, TodoCreateInput, TodoUpdateInput, reorderTodos } from '../models/Todo';
import { StorageService } from '../services/StorageService';
import { NotificationService } from '../services/NotificationService';
import { useTodoStore } from '../stores/todoStore';
import { syncTodoToGitHub } from '../services/TodoGitHubSyncService';

/** Mirrors TodoGitHubSyncService.serializeTodo so synced todos keep the on-disk shape. */
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
    let todo: Todo;
    try {
      todo = await StorageService.createTodo(input);
    } catch (err) {
      console.warn('[TodoContext] createTodo storage failed:', err);
      return null;
    }

    let finalTodo = todo;
    try {
      const notificationId = await NotificationService.scheduleReminder(todo);
      if (notificationId) {
        finalTodo = (await StorageService.updateTodo({ id: todo.id, notificationId })) ?? todo;
      }
    } catch (err) {
      console.warn('[TodoContext] Notification schedule failed:', err);
    }

    useTodoStore.setState((s) => ({ todos: [finalTodo, ...s.todos] }));
    return finalTodo;
  }, []);

  const updateTodo = useMemo(() => async (input: TodoUpdateInput): Promise<Todo | null> => {
    let updated: Todo | null = null;
    try {
      updated = await StorageService.updateTodo(input);
    } catch (err) {
      console.warn('[TodoContext] updateTodo storage failed:', err);
      return null;
    }
    if (!updated) return null;

    let finalTodo = updated;
    try {
      const notificationId = await NotificationService.rescheduleReminder(updated);
      if (notificationId !== updated.notificationId) {
        finalTodo = (await StorageService.updateTodo({ id: updated.id, notificationId })) ?? updated;
      }
    } catch (err) {
      console.warn('[TodoContext] Notification reschedule failed:', err);
    }

    useTodoStore.setState((s) => ({
      todos: s.todos.map((t) => (t.id === finalTodo.id ? finalTodo : t)),
    }));
    return finalTodo;
  }, []);

  const deleteTodo = useMemo(() => async (id: string): Promise<boolean> => {
    try {
      const todo = useTodoStore.getState().todos.find((t) => t.id === id);
      if (todo) await NotificationService.cancelAllForTodo(todo);
      const ok = await StorageService.deleteTodo(id);
      if (ok) useTodoStore.setState((s) => ({ todos: s.todos.filter((t) => t.id !== id) }));
      return ok;
    } catch (error) {
      console.warn('[TodoContext] removeTodo failed:', error);
      return false;
    }
  }, []);

  const toggleTodo = useMemo(() => async (id: string): Promise<boolean> => {
    const todo = useTodoStore.getState().todos.find((t) => t.id === id);
    if (!todo) return false;
    const updated = await StorageService.updateTodo({ id, completed: !todo.completed });
    if (!updated) return false;

    let finalTodo = updated;
    try {
      if (updated.completed) {
        await NotificationService.cancelAllForTodo(updated);
      } else {
        const notificationId = await NotificationService.scheduleReminder(updated);
        if (notificationId && notificationId !== updated.notificationId) {
          finalTodo = (await StorageService.updateTodo({ id, notificationId })) ?? updated;
        }
      }
    } catch (err) {
      console.warn('[TodoContext] Notification toggle handling failed:', err);
    }

    if (todo.repo) {
      const syncResult = await syncTodoToGitHub({
        repo: todo.repo,
        branch: todo.branch,
        filePath: todo.filePath,
        text: finalTodo.text,
        todo: finalTodo,
      });
      if (!syncResult.success) {
        console.warn('[TodoContext] GitHub sync failed:', syncResult.error);
      }
    }

    const nextTodos = reorderTodos(
      useTodoStore.getState().todos.map((t) => (t.id === id ? finalTodo : t)),
    );
    await StorageService.saveAllTodos(nextTodos);
    useTodoStore.setState({ todos: nextTodos });
    return true;
  }, []);

  const refreshTodos = useTodoStore((s) => s.refreshTodos);

  return useMemo(
    () => ({ todos, isLoading, createTodo, updateTodo, deleteTodo, toggleTodo, refreshTodos }),
    [todos, isLoading, createTodo, updateTodo, deleteTodo, toggleTodo, refreshTodos],
  );
}
