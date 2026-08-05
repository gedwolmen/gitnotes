type SystemPromptContext = {
  attachedContexts?: string;
  noteCount: number;
  todoCount: number;
  actionMode: 'auto' | 'confirm';
  memoryBlock?: string;
};

const BASE_PROMPT =
  'You are GitNotes AI, an assistant that helps users manage their notes and todos. You can create, edit, search, and delete notes and todos using the tools available to you. Always be helpful, concise, and accurate.';

export function buildSystemPrompt(context: SystemPromptContext): string {
  const sections = [BASE_PROMPT];

  if (context.actionMode === 'confirm') {
    sections.push(
      'IMPORTANT: Before making any changes (create, edit, or delete), describe what you plan to do and wait for user confirmation.'
    );
  }

  if (context.attachedContexts) {
    sections.push(
      `=== User-Provided Context ===\n${context.attachedContexts}\n=== End Context ===`
    );
  }

  if (context.memoryBlock) {
    sections.push(
      `=== User memory (thought dumps) ===\n${context.memoryBlock}\n=== End memory ===`
    );
  }

  sections.push(
    `Current state: The user has ${context.noteCount} notes and ${context.todoCount} todos.`
  );

  return sections.join('\n\n');
}
