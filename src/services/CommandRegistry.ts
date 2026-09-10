export interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  category: string;
  action: () => void | Promise<void>;
}

const commands: Command[] = [];

export function registerCommand(cmd: Command): void {
  const existing = commands.findIndex(c => c.id === cmd.id);
  if (existing >= 0) {
    commands[existing] = cmd;
  } else {
    commands.push(cmd);
  }
}

export function getCommands(): Command[] {
  return [...commands];
}

export function searchCommands(query: string): Command[] {
  if (!query.trim()) return getCommands();
  const q = query.toLowerCase();
  return commands.filter(
    cmd =>
      cmd.label.toLowerCase().includes(q) ||
      (cmd.description?.toLowerCase().includes(q) ?? false)
  );
}

// Pre-register core app commands
registerCommand({
  id: 'note.new',
  label: 'New Note',
  description: 'Create a new note',
  icon: 'document-text',
  category: 'Notes',
  action: () => {},
});

registerCommand({
  id: 'note.new.todo',
  label: 'New Todo',
  description: 'Create a new todo',
  icon: 'checkbox',
  category: 'Notes',
  action: () => {},
});

registerCommand({
  id: 'nav.home',
  label: 'Go Home',
  description: 'Navigate to home screen',
  icon: 'home',
  category: 'Navigation',
  action: () => {},
});

registerCommand({
  id: 'nav.settings',
  label: 'Open Settings',
  description: 'Navigate to settings',
  icon: 'settings',
  category: 'Navigation',
  action: () => {},
});

registerCommand({
  id: 'nav.calendar',
  label: 'Open Calendar',
  description: 'Navigate to calendar',
  icon: 'calendar',
  category: 'Navigation',
  action: () => {},
});

registerCommand({
  id: 'theme.toggle',
  label: 'Toggle Theme',
  description: 'Switch between light and dark mode',
  icon: 'contrast',
  category: 'Settings',
  action: () => {},
});

registerCommand({
  id: 'sync.force',
  label: 'Force Sync',
  description: 'Trigger a manual sync',
  icon: 'sync',
  category: 'Sync',
  action: () => {},
});

registerCommand({
  id: 'paywall.open',
  label: 'Open Paywall',
  description: 'View GitNotēs Pro plans',
  icon: 'card',
  category: 'Settings',
  action: () => {},
});

registerCommand({
  id: 'nav.notes',
  label: 'Go to Notes',
  description: 'Navigate to notes list',
  icon: 'document-text-outline',
  category: 'Navigation',
  action: () => {},
});

registerCommand({
  id: 'nav.explore',
  label: 'Go to Explore',
  description: 'Navigate to explore screen',
  icon: 'compass-outline',
  category: 'Navigation',
  action: () => {},
});

registerCommand({
  id: 'nav.todos',
  label: 'Go to Todos',
  description: 'Navigate to todos list',
  icon: 'checkbox-outline',
  category: 'Navigation',
  action: () => {},
});

registerCommand({
  id: 'note.new.canvas',
  label: 'New Canvas',
  description: 'Create a new canvas',
  icon: 'brush-outline',
  category: 'Notes',
  action: () => {},
});

registerCommand({
  id: 'note.new.thoughtdump',
  label: 'Thought Dump',
  description: 'Quick capture a thought',
  icon: 'flash-outline',
  category: 'Notes',
  action: () => {},
});
