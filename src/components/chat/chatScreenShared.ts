import type { AIContextItem } from '../../models/AIProvider';
import type { ChatMessage } from '../../models/Chat';
import * as AIService from '../../services/AIService';
import { executeToolCall } from '../../services/ai/actionExecutor';

export type ToolEvent = {
  type: 'tool-call' | 'tool-call-streaming-start' | 'tool-call-delta' | 'tool-result';
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  argsTextDelta?: string;
  result?: unknown;
};

export type PendingConfirmation = {
  toolName: string;
  args: Record<string, unknown>;
  description: string;
  details: Record<string, unknown>;
  messageId: string;
};

export type RetryPayload = {
  text: string;
  contexts: AIContextItem[];
};

export type ChatRequestMessage = Parameters<typeof AIService.streamChatResponse>[1][number];

const TOOL_EVENT_TYPES = new Set<ToolEvent['type']>([
  'tool-call',
  'tool-call-streaming-start',
  'tool-call-delta',
  'tool-result',
]);

export function dedupeContexts(items: AIContextItem[]): AIContextItem[] {
  const map = new Map<string, AIContextItem>();
  for (const item of items) {
    const key = `${item.type}:${item.owner}/${item.repo}/${item.path}@${item.branch ?? ''}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseToolEvent(chunk: string): ToolEvent | null {
  try {
    const parsed = JSON.parse(chunk) as ToolEvent;
    return TOOL_EVENT_TYPES.has(parsed.type) ? parsed : null;
  } catch (error) {
    void error;
    return null;
  }
}

// Some providers (notably Ring-2.6-1T via OpenRouter) emit assistant text as a
// JSON-stringified value — a quoted string with `\n`/`\t`/`\"` escape
// sequences. The Markdown renderer takes that literally and shows backslash-n
// instead of newlines. Detect over-escaped chunks and decode them so the
// reader sees real whitespace. Conservative: only triggers on chunks that
// (a) parse as a JSON string AND (b) look quoted/escaped, so plain markdown
// text — which never starts with a `"` or `{` — passes through untouched.
//
// Additionally handle shell-escaped file paths from Maestro screenshot tools,
// where spaces are escaped as `\ ` (e.g., "Simulator\ Screenshot\ -\ iPhone").
export function decodeOverEscapedChunk(chunk: string): string {
  if (!chunk) return chunk;
  const trimmed = chunk.trim();
  if (!trimmed) return chunk;

  // Handle JSON-stringified escape sequences (\n, \t, \")
  const looksQuoted = trimmed.startsWith('"') && trimmed.endsWith('"');
  const looksEscaped = trimmed.includes('\\n') || trimmed.includes('\\t') || trimmed.includes('\\"');
  if (looksQuoted && looksEscaped) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
    } catch (error) {
      void error;
    }
  }

  // Handle shell-escaped file paths: spaces escaped as "\ " in paths like
  // /Users/.../Simulator\ Screenshot\ -\ iPhone\ 17\ Pro.png
  // Only unescape if chunk looks like a file path (starts with /, ~, or .)
  if (/^[/.~]/.test(trimmed) && trimmed.includes('\\ ')) {
    return trimmed.replace(/\\ /g, ' ');
  }

  return chunk;
}

export function parseToolArgs(value: unknown, fallback = ''): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (!fallback.trim()) return {};
  try {
    const parsed = JSON.parse(fallback);
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    void error;
    return {};
  }
}

export function formatHistoryMessage(message: ChatMessage): ChatRequestMessage {
  const content =
    message.content
    || (message.toolCallName
      ? `${message.toolCallName}: ${JSON.stringify(message.toolCallArgs ?? {})}${message.toolCallResult ? `\nResult: ${message.toolCallResult}` : ''}`
      : '');

  return { role: message.role, content };
}

export function formatToolResult(value: unknown): string {
  if (typeof value === 'string') return decodeOverEscapedChunk(value);
  if (value == null) return 'Done.';
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    void error;
    return 'Done.';
  }
}

export function formatExecutorResult(result: Awaited<ReturnType<typeof executeToolCall>>): string {
  if (!result.success) return result.error ? decodeOverEscapedChunk(result.error) : 'Tool execution failed.';
  if (result.requiresConfirmation && result.proposedChanges) return result.proposedChanges.description;
  return formatToolResult(result.data);
}
