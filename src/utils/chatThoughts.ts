export interface ParsedThoughtContent {
  thought: string | null;
  visible: string;
}

export function parseThoughtContent(raw: string | undefined): ParsedThoughtContent {
  const text = raw ?? '';
  const matches = Array.from(text.matchAll(/<think>([\s\S]*?)<\/think>/gi));
  const thought = matches
    .map((match) => match[1]?.trim())
    .filter((value): value is string => !!value)
    .join('\n\n')
    .trim();

  const visible = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    thought: thought.length > 0 ? thought : null,
    visible,
  };
}

export function stripThoughtContent(raw: string | undefined): string {
  return parseThoughtContent(raw).visible;
}
