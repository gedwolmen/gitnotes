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
  if (typeof value === 'string') return value;
  if (value == null) return 'Done.';
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    void error;
    return 'Done.';
  }
}

export function formatExecutorResult(result: Awaited<ReturnType<typeof executeToolCall>>): string {
  if (!result.success) return result.error ?? 'Tool execution failed.';
  if (result.requiresConfirmation && result.proposedChanges) return result.proposedChanges.description;
  return formatToolResult(result.data);
}
