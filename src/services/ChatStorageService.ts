import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { ChatThread, ChatThreadSummary } from '../models/Chat';
import { GitHubService } from './GitHubService';

const GITHUB_API = 'https://api.github.com';
const CHAT_DIR = '.gitnotes/chats';
const INDEX_PATH = `${CHAT_DIR}/index.json`;
const TOKEN_KEY = '@gitnotes:github_token';

interface GitHubContentResponse {
  content?: string;
  sha?: string;
}

interface ChatIndex {
  threads: ChatThreadSummary[];
}

function getIndexCacheKey(owner: string, repo: string): string {
  return `chat-index-${owner}-${repo}`;
}

function getThreadCacheKey(threadId: string): string {
  return `chat-thread-${threadId}`;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function contentUrl(owner: string, repo: string, path: string): string {
  return `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodePath(path)}`;
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): string {
  const binary = atob(value.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function getStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

async function getToken(): Promise<string> {
  if (!GitHubService.isAuthenticated()) {
    throw new Error('GitHub not authenticated');
  }

  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) {
    throw new Error('GitHub token is not configured');
  }

  return token;
}

async function githubRequest<T>(params: {
  owner: string;
  repo: string;
  path: string;
  method?: 'GET' | 'PUT' | 'DELETE';
  branch?: string;
  data?: Record<string, unknown>;
}): Promise<T> {
  const token = await getToken();
  const { owner, repo, path, method = 'GET', branch, data } = params;
  const url = contentUrl(owner, repo, path);
  const response = await axios.request<T>({
    url,
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `token ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    params: method === 'GET' && branch ? { ref: branch } : undefined,
    data,
  });
  return response.data;
}

async function getFile(owner: string, repo: string, path: string, branch: string): Promise<GitHubContentResponse | null> {
  try {
    return await githubRequest<GitHubContentResponse>({ owner, repo, path, branch });
  } catch (error) {
    if (getStatus(error) === 404) {
      return null;
    }
    throw error;
  }
}

async function putFile(params: {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  message: string;
  content: string;
  sha?: string;
}): Promise<void> {
  const { owner, repo, path, branch, message, content } = params;
  let sha = params.sha;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await githubRequest({
        owner,
        repo,
        path,
        method: 'PUT',
        data: {
          message,
          content: toBase64(content),
          branch,
          ...(sha ? { sha } : {}),
        },
      });
      return;
    } catch (error) {
      const status = getStatus(error);
      if ((status === 409 || status === 422) && attempt < 2) {
        const latest = await getFile(owner, repo, path, branch);
        sha = latest?.sha;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

async function deleteFile(params: {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  message: string;
  sha: string;
}): Promise<void> {
  const { owner, repo, path, branch, message } = params;
  let sha = params.sha;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await githubRequest({
        owner,
        repo,
        path,
        method: 'DELETE',
        data: { message, sha, branch },
      });
      return;
    } catch (error) {
      const status = getStatus(error);
      if (status === 404) {
        return;
      }
      if ((status === 409 || status === 422) && attempt < 2) {
        const latest = await getFile(owner, repo, path, branch);
        if (!latest?.sha) {
          return;
        }
        sha = latest.sha;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

async function writeIndex(owner: string, repo: string, branch: string, threads: ChatThreadSummary[]): Promise<void> {
  const sortedThreads = sortThreads(threads);
  const existingIndex = await getFile(owner, repo, INDEX_PATH, branch);
  await putFile({
    owner,
    repo,
    path: INDEX_PATH,
    branch,
    message: 'Update chat index',
    content: JSON.stringify({ threads: sortedThreads }, null, 2),
    sha: existingIndex?.sha,
  });
  await AsyncStorage.setItem(getIndexCacheKey(owner, repo), JSON.stringify(sortedThreads));
}

function sortThreads(threads: ChatThreadSummary[]): ChatThreadSummary[] {
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
}

function toThreadSummary(thread: ChatThread): ChatThreadSummary {
  const lastMessage = thread.messages.length > 0 ? thread.messages[thread.messages.length - 1] : undefined;
  return {
    id: thread.id,
    title: thread.title,
    updatedAt: thread.updatedAt,
    messageCount: thread.messages.length,
    preview: lastMessage?.content || 'No messages yet',
  };
}

export async function initializeChatStorage(owner: string, repo: string, branch: string = 'main'): Promise<boolean> {
  if (!GitHubService.isAuthenticated()) {
    return false;
  }

  const files = [
    {
      path: `${CHAT_DIR}/.gitkeep`,
      message: 'Initialize chat storage',
      content: '',
    },
    {
      path: INDEX_PATH,
      message: 'Initialize chat index',
      content: JSON.stringify({ threads: [] }, null, 2),
    },
  ];

  for (const file of files) {
    try {
      await putFile({ owner, repo, path: file.path, branch, message: file.message, content: file.content });
    } catch (error) {
      const status = getStatus(error);
      if (status !== 409 && status !== 422) {
        throw error;
      }
    }
  }

  await AsyncStorage.setItem(getIndexCacheKey(owner, repo), JSON.stringify([]));
  return true;
}

export async function loadThreadSummaries(owner: string, repo: string, branch: string = 'main'): Promise<ChatThreadSummary[]> {
  const cacheKey = getIndexCacheKey(owner, repo);

  try {
    const indexFile = await getFile(owner, repo, INDEX_PATH, branch);
    if (!indexFile?.content) {
      await AsyncStorage.setItem(cacheKey, JSON.stringify([]));
      return [];
    }

    const parsed = JSON.parse(fromBase64(indexFile.content)) as ChatIndex;
    const threads = sortThreads(Array.isArray(parsed.threads) ? parsed.threads : []);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(threads));
    return threads;
  } catch (error) {
    if (getStatus(error) === 404) {
      await AsyncStorage.setItem(cacheKey, JSON.stringify([]));
      return [];
    }

    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as ChatThreadSummary[];
      } catch {
        await AsyncStorage.removeItem(cacheKey);
      }
    }

    throw error;
  }
}

export async function loadThread(
  owner: string,
  repo: string,
  threadId: string,
  branch: string = 'main',
): Promise<ChatThread | null> {
  const cacheKey = getThreadCacheKey(threadId);
  const path = `${CHAT_DIR}/${threadId}.json`;

  try {
    const file = await getFile(owner, repo, path, branch);
    if (!file?.content) {
      return null;
    }

    const thread = JSON.parse(fromBase64(file.content)) as ChatThread;
    await AsyncStorage.setItem(cacheKey, JSON.stringify(thread));
    return thread;
  } catch (error) {
    if (getStatus(error) === 404) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as ChatThread;
      } catch {
        await AsyncStorage.removeItem(cacheKey);
      }
    }

    throw error;
  }
}

export async function saveThread(thread: ChatThread): Promise<void> {
  const owner = thread.repoOwner;
  const repo = thread.repoName;
  const branch = thread.branch || 'main';
  const path = `${CHAT_DIR}/${thread.id}.json`;

  const existingThread = await getFile(owner, repo, path, branch);
  await putFile({
    owner,
    repo,
    path,
    branch,
    message: existingThread?.sha ? `Update chat thread: ${thread.title}` : `Create chat thread: ${thread.title}`,
    content: JSON.stringify(thread, null, 2),
    sha: existingThread?.sha,
  });

  const summaries = await loadThreadSummaries(owner, repo, branch);
  const nextSummaries = sortThreads([
    ...summaries.filter((summary) => summary.id !== thread.id),
    toThreadSummary(thread),
  ]);

  await writeIndex(owner, repo, branch, nextSummaries);
  await AsyncStorage.setItem(getThreadCacheKey(thread.id), JSON.stringify(thread));
}

export async function deleteThread(
  owner: string,
  repo: string,
  threadId: string,
  branch: string = 'main',
): Promise<boolean> {
  const path = `${CHAT_DIR}/${threadId}.json`;
  const existingThread = await getFile(owner, repo, path, branch);
  const summaries = await loadThreadSummaries(owner, repo, branch);
  const nextSummaries = summaries.filter((summary) => summary.id !== threadId);

  if (!existingThread?.sha) {
    await writeIndex(owner, repo, branch, nextSummaries);
    await AsyncStorage.removeItem(getThreadCacheKey(threadId));
    return false;
  }

  await deleteFile({
    owner,
    repo,
    path,
    branch,
    message: `Delete chat thread: ${threadId}`,
    sha: existingThread.sha,
  });

  await writeIndex(owner, repo, branch, nextSummaries);
  await AsyncStorage.removeItem(getThreadCacheKey(threadId));
  return true;
}

export async function isChatStorageInitialized(
  owner: string,
  repo: string,
  branch: string = 'main',
): Promise<boolean> {
  try {
    const file = await getFile(owner, repo, INDEX_PATH, branch);
    return !!file;
  } catch (error) {
    if (getStatus(error) === 404) {
      return false;
    }
    throw error;
  }
}
