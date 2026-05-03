export type TodoPriority = 'low' | 'medium' | 'high';

export interface TodoGitHubLink {
  owner: string;
  repo: string;
  issueNumber?: number;
  prNumber?: number;
  milestoneNumber?: number;
  htmlUrl?: string;
  title?: string;
}

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
  dueDate?: number;
  reminderBeforeMinutes?: number;
  notificationId?: string;
  priority?: TodoPriority;
  tags?: string[];
  notes?: string;
  linkedNoteId?: string;
  github?: TodoGitHubLink;
  repo?: string;
  branch?: string;
  filePath?: string;
}

export interface TodoCreateInput {
  text: string;
  completed?: boolean;
  dueDate?: number;
  reminderBeforeMinutes?: number;
  priority?: TodoPriority;
  tags?: string[];
  notes?: string;
  linkedNoteId?: string;
  github?: TodoGitHubLink;
  repo?: string;
  branch?: string;
  filePath?: string;
}

export interface TodoUpdateInput {
  id: string;
  text?: string;
  completed?: boolean;
  dueDate?: number;
  reminderBeforeMinutes?: number;
  notificationId?: string;
  priority?: TodoPriority;
  tags?: string[];
  notes?: string;
  linkedNoteId?: string;
  github?: TodoGitHubLink;
  repo?: string;
  branch?: string;
  filePath?: string;
}

function generateId(): string {
  return `todo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createTodoItem(input: TodoCreateInput): Todo {
  const now = Date.now();
  return {
    id: generateId(),
    text: input.text,
    completed: input.completed ?? false,
    createdAt: now,
    updatedAt: now,
    dueDate: input.dueDate,
    reminderBeforeMinutes: input.reminderBeforeMinutes,
    priority: input.priority,
    tags: input.tags ?? [],
    notes: input.notes,
    linkedNoteId: input.linkedNoteId,
    github: input.github,
    repo: input.repo,
    branch: input.branch,
    filePath: input.filePath,
  };
}

export function applyTodoUpdate(existing: Todo, input: Partial<TodoUpdateInput>): Todo {
  return {
    ...existing,
    text: input.text ?? existing.text,
    completed: input.completed ?? existing.completed,
    dueDate: 'dueDate' in input ? input.dueDate : existing.dueDate,
    reminderBeforeMinutes: 'reminderBeforeMinutes' in input ? input.reminderBeforeMinutes : existing.reminderBeforeMinutes,
    notificationId: 'notificationId' in input ? input.notificationId : existing.notificationId,
    priority: 'priority' in input ? input.priority : existing.priority,
    tags: input.tags ?? existing.tags,
    notes: 'notes' in input ? input.notes : existing.notes,
    linkedNoteId: 'linkedNoteId' in input ? input.linkedNoteId : existing.linkedNoteId,
    github: 'github' in input ? input.github : existing.github,
    repo: 'repo' in input ? input.repo : existing.repo,
    branch: 'branch' in input ? input.branch : existing.branch,
    filePath: 'filePath' in input ? input.filePath : existing.filePath,
    updatedAt: Date.now(),
  };
}

const TODO_PRIORITY_ORDER: Record<TodoPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function compareTodos(a: Todo, b: Todo): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  const priorityDiff = TODO_PRIORITY_ORDER[a.priority || 'medium'] - TODO_PRIORITY_ORDER[b.priority || 'medium'];
  if (priorityDiff !== 0) return priorityDiff;
  return b.createdAt - a.createdAt;
}

export function reorderTodos(todos: Todo[]): Todo[] {
  return [...todos].sort(compareTodos);
}

export function slugifyTodoText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled';
}

export const PRIORITY_COLORS: Record<TodoPriority, string> = {
  low: '#34C759',
  medium: '#FF9500',
  high: '#FF3B30',
};

export const PRIORITY_LABELS: Record<TodoPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const REMINDER_OPTIONS: { label: string; minutes: number }[] = [
  { label: 'At deadline', minutes: 0 },
  { label: '5 min before', minutes: 5 },
  { label: '15 min before', minutes: 15 },
  { label: '30 min before', minutes: 30 },
  { label: '1 hour before', minutes: 60 },
  { label: '2 hours before', minutes: 120 },
  { label: '3 hours before', minutes: 180 },
  { label: '1 day before', minutes: 1440 },
];
