export interface ThoughtDump {
  id: string;
  text: string;
  createdAt: string;
  filePath: string;
}

export function createThoughtDump(text: string): ThoughtDump {
  const now = new Date();
  const id = generateId();
  const timestamp = formatTimestamp(now);
  const filePath = `thoughts/${timestamp}-${id.slice(0, 8)}.md`;
  return {
    id,
    text,
    createdAt: now.toISOString(),
    filePath,
  };
}

export function serializeThoughtDump(dump: ThoughtDump): string {
  return `<!-- thought-dump id:${dump.id} created:${dump.createdAt} -->\n\n${dump.text}`;
}

export function parseThoughtDump(content: string, filePath: string): ThoughtDump | null {
  const match = content.match(
    /^<!-- thought-dump id:(\S+) created:(\S+) -->\s*\n\s*\n?([\s\S]*)$/,
  );
  if (!match) return null;
  return {
    id: match[1],
    text: match[3],
    createdAt: match[2],
    filePath,
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}
