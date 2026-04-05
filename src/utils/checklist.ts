export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  lineIndex: number;
  indent: number;
}

const CHECKBOX_PATTERN = /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/;

export function parseChecklistItems(content: string): ChecklistItem[] {
  const lines = content.split('\n');
  const items: ChecklistItem[] = [];

  lines.forEach((line, index) => {
    const match = line.match(CHECKBOX_PATTERN);
    if (match) {
      items.push({
        id: `item-${index}`,
        text: match[3],
        checked: match[2].toLowerCase() === 'x',
        lineIndex: index,
        indent: match[1].length,
      });
    }
  });

  return items;
}

export function toggleChecklistItem(content: string, lineIndex: number): string {
  const lines = content.split('\n');
  const line = lines[lineIndex];

  const match = line.match(CHECKBOX_PATTERN);
  if (!match) return content;

  const indent = match[1];
  const text = match[3];
  const newChecked = match[2].toLowerCase() !== 'x';

  lines[lineIndex] = `${indent}- [${newChecked ? 'x' : ' '}] ${text}`;

  return lines.join('\n');
}

export function getChecklistProgress(content: string): { total: number; completed: number } {
  const items = parseChecklistItems(content);
  const total = items.length;
  const completed = items.filter((item) => item.checked).length;
  return { total, completed };
}

export function formatChecklistProgress(progress: { total: number; completed: number }): string {
  if (progress.total === 0) return '';
  const percentage = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  return `${progress.completed}/${progress.total} (${percentage}%)`;
}

export function hasChecklists(content: string): boolean {
  return CHECKBOX_PATTERN.test(content);
}

export function addChecklistItem(content: string, text: string, checked: boolean = false): string {
  const lines = content.split('\n');
  const newLine = `- [${checked ? 'x' : ' '}] ${text}`;
  lines.push(newLine);
  return lines.join('\n');
}

export function removeChecklistItem(content: string, lineIndex: number): string {
  const lines = content.split('\n');
  if (lineIndex >= 0 && lineIndex < lines.length) {
    lines.splice(lineIndex, 1);
  }
  return lines.join('\n');
}

export function updateChecklistItemText(content: string, lineIndex: number, newText: string): string {
  const lines = content.split('\n');
  const line = lines[lineIndex];

  const match = line.match(CHECKBOX_PATTERN);
  if (!match) return content;

  const indent = match[1];
  const checked = match[2].toLowerCase() === 'x';
  lines[lineIndex] = `${indent}- [${checked ? 'x' : ' '}] ${newText}`;

  return lines.join('\n');
}