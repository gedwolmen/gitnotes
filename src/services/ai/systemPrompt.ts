type SystemPromptContext = {
  attachedContexts?: string;
  noteCount: number;
  todoCount: number;
  actionMode: 'auto' | 'confirm';
  memoryBlock?: string;
  githubToolsEnabled?: boolean;
  githubAccountLogin?: string;
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

  if (context.githubToolsEnabled) {
    const loginLine = context.githubAccountLogin
      ? ` for the account @${context.githubAccountLogin}`
      : '';
    sections.push(
      `=== GitHub Tools${loginLine} ===
You have access to GitHub tools:
- list_repos: list repositories the user has access to
- list_issues / create_issue: view and create issues in any repository
- list_pull_requests / create_pull_request: view and open pull requests
- get_pull_request_diff: fetch the file-level diff for review
- review_pull_request: post an APPROVE, REQUEST_CHANGES, or COMMENT review on a PR
Use these tools when the user asks about their repos, issues, PRs, or reviews. Always confirm before write operations if the user has actionMode=confirm.
=== End GitHub Tools ===`
    );
  }

  sections.push(
    `Current state: The user has ${context.noteCount} notes and ${context.todoCount} todos.`
  );

  sections.push(
    `=== Reminder Tools ===
You have access to reminder tools:
- create_reminder: Set a reminder to revisit a note, folder, repo, or tagged notes at a specific time (HH:MM, 24-hour). Supports daily, weekly, or one-time schedules.
- list_reminders: View all reminders with their schedules and entity labels.
- cancel_reminder: Remove a reminder by ID or by matching the entity it points to.

PROACTIVE SUGGESTIONS: After creating study, review, or quiz content (notes with tags like 'study', 'review', 'quiz', 'flashcards', or 'questioner'), proactively suggest setting a reminder. Say something like: "I created a quiz on [topic]. Would you like me to set a weekly reminder to review it?" — NEVER auto-create without user confirmation.
=== End Reminder Tools ===`
  );

  return sections.join('\n\n');
}
