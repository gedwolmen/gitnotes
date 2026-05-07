import { AIContextItem } from './AIProvider';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolCallName?: string;
  toolCallArgs?: Record<string, unknown>;
  toolCallResult?: string;
  attachedContexts?: AIContextItem[];
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  repoOwner: string;
  repoName: string;
  branch: string;
  filePath: string;
}

export interface ChatThreadSummary {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  preview?: string;
}
