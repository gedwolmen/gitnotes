import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Todo, TodoCreateInput, TodoUpdateInput } from '../models/Todo';
import { StorageService } from '../services/StorageService';
import { NotificationService } from '../services/NotificationService';

interface TodoContextValue {
  todos: Todo[];
  isLoading: boolean;
  createTodo: (input: TodoCreateInput) => Promise<Todo | null>;
  updateTodo: (input: TodoUpdateInput) => Promise<Todo | null>;
  deleteTodo: (id: string) => Promise<boolean>;
  toggleTodo: (id: string) => Promise<boolean>;
  refreshTodos: () => Promise<void>;
}

const TodoContext = createContext<TodoContextValue | undefined>(undefined);

export function TodoProvider({ children }: { children: React.ReactNode }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Stable ref so deleteTodo/toggleTodo callbacks don't churn on each todos
  // mutation (which would cascade re-renders to every consumer).
  const todosRef = useRef(todos);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  const loadTodos = useCallback(async () => {
    const loaded = await StorageService.getAllTodos();
    setTodos(loaded);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  const createTodo = useCallback(async (input: TodoCreateInput): Promise<Todo | null> => {
    try {
      const todo = await StorageService.createTodo(input);
      const notificationId = await NotificationService.scheduleReminder(todo);
      const finalTodo = notificationId
        ? await StorageService.updateTodo({ id: todo.id, notificationId }) ?? todo
        : todo;
      setTodos((prev) => [finalTodo, ...prev]);
      return finalTodo;
    } catch {
      return null;
    }
  }, []);

  const updateTodo = useCallback(async (input: TodoUpdateInput): Promise<Todo | null> => {
    try {
      const updated = await StorageService.updateTodo(input);
      if (!updated) return null;
      const notificationId = await NotificationService.rescheduleReminder(updated);
      const finalTodo = notificationId !== updated.notificationId
        ? await StorageService.updateTodo({ id: updated.id, notificationId }) ?? updated
        : updated;
      setTodos((prev) => prev.map((t) => (t.id === finalTodo.id ? finalTodo : t)));
      return finalTodo;
    } catch {
      return null;
    }
  }, []);

  const deleteTodo = useCallback(async (id: string): Promise<boolean> => {
    try {
      const todo = todosRef.current.find((t) => t.id === id);
      if (todo) await NotificationService.cancelAllForTodo(todo);
      const ok = await StorageService.deleteTodo(id);
      if (ok) setTodos((prev) => prev.filter((t) => t.id !== id));
      return ok;
    } catch {
      return false;
    }
  }, []);

  const toggleTodo = useCallback(async (id: string): Promise<boolean> => {
    const todo = todosRef.current.find((t) => t.id === id);
    if (!todo) return false;
    const updated = await StorageService.updateTodo({ id, completed: !todo.completed });
    if (!updated) return false;
    if (updated.completed) {
      await NotificationService.cancelAllForTodo(updated);
    } else {
      const notificationId = await NotificationService.scheduleReminder(updated);
      if (notificationId && notificationId !== updated.notificationId) {
        const withNotification = await StorageService.updateTodo({ id, notificationId });
        setTodos((prev) => prev.map((t) => (t.id === id ? (withNotification ?? updated) : t)));
        return true;
      }
    }
    setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return true;
  }, []);

  const refreshTodos = useCallback(async () => {
    await loadTodos();
  }, [loadTodos]);

  const value = useMemo(
    () => ({ todos, isLoading, createTodo, updateTodo, deleteTodo, toggleTodo, refreshTodos }),
    [todos, isLoading, createTodo, updateTodo, deleteTodo, toggleTodo, refreshTodos],
  );

  return (
    <TodoContext.Provider value={value}>
      {children}
    </TodoContext.Provider>
  );
}

export function useTodos(): TodoContextValue {
  const ctx = useContext(TodoContext);
  if (!ctx) throw new Error('useTodos must be used within TodoProvider');
  return ctx;
}
