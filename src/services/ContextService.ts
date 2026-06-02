import axios from 'axios';
import type { AIContextItem } from '../models/AIProvider';
import { useNoteStore } from '../stores/noteStore';
import { useTodoStore } from '../stores/todoStore';
import AuthService from './AuthService';
import {
  DEFAULT_CHAT_BRANCH,
  MAX_CONTEXT_FILE_BYTES as MAX_FILE_SIZE,
  MAX_CONTEXT_TOTAL_BYTES as MAX_CONTEXT_SIZE,
} from './ai/config';
const BINARY_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.mp4', '.mov', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz', '.rar'];

type GitHubContentType = 'file' | 'dir' | 'symlink' | 'submodule';

interface GitHubContentResponse {
  name: string;
  path: string;
  type: GitHubContentType;
  size: number;
  content?: string;
  encoding?: string;
}

export interface ContextFileContent {
  content: string;
  name: string;
  size: number;
  truncated: boolean;
}

export interface ContextFolderItem {
  name: string;
  path: string;
  type: GitHubContentType;
  size?: number;
}

function getNameFromPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] || path || 'root';
}

function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  let outLen = (cleaned.length / 4) * 3;
  if (cleaned.endsWith('==')) outLen -= 2;
  else if (cleaned.endsWith('=')) outLen -= 1;
  const bytes = new Uint8Array(Math.max(0, outLen));
  let bi = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c1 = chars.indexOf(cleaned[i]);
    const c2 = chars.indexOf(cleaned[i + 1]);
    const c3 = cleaned[i + 2] === '=' ? 64 : chars.indexOf(cleaned[i + 2]);
    const c4 = cleaned[i + 3] === '=' ? 64 : chars.indexOf(cleaned[i + 3]);
    if (c1 < 0 || c2 < 0) break;
    bytes[bi++] = (c1 << 2) | (c2 >> 4);
    if (c3 !== 64 && c3 >= 0) bytes[bi++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (c4 !== 64 && c4 >= 0) bytes[bi++] = ((c3 & 3) << 6) | c4;
  }
  return bytes.subarray(0, bi);
}

function utf8DecodeBytes(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    if (b1 < 0x80) {
      out += String.fromCharCode(b1);
      continue;
    }
    if ((b1 & 0xe0) === 0xc0 && i < bytes.length) {
      const b2 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
      continue;
    }
    if ((b1 & 0xf0) === 0xe0 && i + 1 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
      continue;
    }
    if ((b1 & 0xf8) === 0xf0 && i + 2 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const b4 = bytes[i++];
      const cp = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
      const cpAdj = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (cpAdj >> 10), 0xdc00 + (cpAdj & 0x3ff));
      continue;
    }
    out += '�';
  }
  return out;
}

function decodeBase64(base64: string): string {
  const bytes = base64ToBytes(base64);
  const TD: typeof TextDecoder | undefined = (globalThis as typeof globalThis & { TextDecoder?: typeof TextDecoder }).TextDecoder;
  if (TD) {
    try {
      return new TD('utf-8').decode(bytes);
    } catch (error) {
      console.warn('[ContextService] TextDecoder.decode failed:', error);
      // fall through
    }
  }
  return utf8DecodeBytes(bytes);
}

function getByteLength(value: string): number {
  const encoder = new TextEncoder();
  return encoder.encode(value).length;
}

function truncateToByteLimit(value: string, limit: number): string {
  if (getByteLength(value) <= limit) {
    return value;
  }

  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (getByteLength(value.slice(0, mid)) <= limit) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return value.slice(0, low);
}

function normalizeFolderPath(folderPath?: string): string | null {
  if (!folderPath) return null;
  const trimmed = folderPath.trim();
  if (!trimmed) return '/';
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  if (!withoutTrailingSlash) return '/';
  return withoutTrailingSlash.startsWith('/') ? withoutTrailingSlash : `/${withoutTrailingSlash}`;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await AuthService.getToken();
  if (!token) {
    throw new Error('GitHub token is not available');
  }

  return {
    Accept: 'application/vnd.github+json',
    Authorization: `token ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function getGitHubContents(owner: string, repo: string, branch: string, path: string): Promise<GitHubContentResponse | GitHubContentResponse[]> {
  const headers = await getAuthHeaders();
  const encodedPath = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const suffix = encodedPath ? `/${encodedPath}` : '';
  const url = `https://api.github.com/repos/${owner}/${repo}/contents${suffix}`;
  const response = await axios.get<GitHubContentResponse | GitHubContentResponse[]>(url, {
    headers,
    params: { ref: branch },
  });
  return response.data;
}

function formatFolderContents(items: ContextFolderItem[]): string {
  if (!items.length) {
    return '(empty)';
  }

  return items
    .map((item) => `${item.type === 'dir' ? '[dir]' : '[file]'} ${item.path}${typeof item.size === 'number' ? ` (${item.size} bytes)` : ''}`)
    .join('\n');
}

export function isBinaryFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function getFileContent(owner: string, repo: string, branch: string, path: string): Promise<ContextFileContent> {
  const name = getNameFromPath(path);
  if (isBinaryFile(name)) {
    return {
      content: '[Binary file skipped]',
      name,
      size: 0,
      truncated: false,
    };
  }

  const data = await getGitHubContents(owner, repo, branch, path);
  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`Path is not a file: ${path}`);
  }

  const decoded = decodeBase64((data.content || '').replace(/\n/g, ''));
  const truncated = getByteLength(decoded) > MAX_FILE_SIZE;
  const content = truncated
    ? `${truncateToByteLimit(decoded, MAX_FILE_SIZE)}\n\n[Truncated to 50KB]`
    : decoded;

  return {
    content,
    name: data.name,
    size: data.size,
    truncated,
  };
}

export async function getFolderContents(owner: string, repo: string, branch: string, folderPath: string): Promise<ContextFolderItem[]> {
  const data = await getGitHubContents(owner, repo, branch, folderPath);
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item) => ({
    name: item.name,
    path: item.path,
    type: item.type,
    size: item.type === 'file' ? item.size : undefined,
  }));
}

export async function getRepoStructure(owner: string, repo: string, branch: string): Promise<ContextFolderItem[]> {
  return getFolderContents(owner, repo, branch, '');
}

function formatNotesForContext(notes: ReturnType<typeof useNoteStore.getState>['notes']): string {
  if (!notes.length) {
    return 'No local notes found.';
  }

  return notes
    .map((note) => {
      const tags = note.tags.length ? note.tags.join(', ') : 'none';
      return `## ${note.title}\n${note.content}\nTags: ${tags}\n---`;
    })
    .join('\n');
}

// `arg` is dual-meaning: the picker passes a note id when a single note is attached,
// but folder-scope attachments still pass a folder path — try id lookup first, then fall back.
export function getLocalNotesForContext(arg?: string): string {
  const notes = useNoteStore.getState().notes;
  if (!arg) return formatNotesForContext(notes);

  const byId = notes.find((note) => note.id === arg);
  if (byId) return formatNotesForContext([byId]);

  const targetFolder = normalizeFolderPath(arg);
  const byFolder = targetFolder
    ? notes.filter((note) => normalizeFolderPath(note.folderPath) === targetFolder)
    : notes;
  return formatNotesForContext(byFolder);
}

export function getLocalTodosForContext(): string {
  const todos = useTodoStore.getState().todos;
  if (!todos.length) {
    return 'No local todos found.';
  }

  const pending = todos.filter((todo) => !todo.completed);
  const completed = todos.filter((todo) => todo.completed);

  const formatTodos = (items: typeof todos) => (
    items.length
      ? items.map((todo) => `- [${todo.completed ? 'x' : ' '}] ${todo.text} (${todo.priority ?? 'medium'})`).join('\n')
      : '- none'
  );

  return `## Pending\n${formatTodos(pending)}\n\n## Completed\n${formatTodos(completed)}`;
}

export async function buildContextString(items: AIContextItem[]): Promise<string> {
  let context = '';

  for (const item of items) {
    let content = '';
    const branch = item.branch || DEFAULT_CHAT_BRANCH;

    try {
      if (item.type === 'file') {
        const file = await getFileContent(item.owner, item.repo, branch, item.path);
        content = file.content;
      } else if (item.type === 'folder') {
        const folder = await getFolderContents(item.owner, item.repo, branch, item.path);
        content = formatFolderContents(folder);
      } else if (item.type === 'repo') {
        const repo = await getRepoStructure(item.owner, item.repo, branch);
        content = formatFolderContents(repo);
      } else if (item.type === 'local-notes') {
        content = getLocalNotesForContext(item.path || undefined);
      } else if (item.type === 'local-todos') {
        content = getLocalTodosForContext();
      }
    } catch (error) {
      content = error instanceof Error ? `[Failed to load context: ${error.message}]` : '[Failed to load context]';
    }

    const section = `=== Context: ${item.name} (${item.type}) ===\n${content}\n\n`;
    const remaining = MAX_CONTEXT_SIZE - getByteLength(context);
    if (remaining <= 0) {
      break;
    }

    if (getByteLength(section) <= remaining) {
      context += section;
      continue;
    }

    context += truncateToByteLimit(section, remaining);
    break;
  }

  return context;
}
