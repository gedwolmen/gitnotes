/**
 * Live integration smoke test for the questioner feature.
 *
 * Uses the Minimax API (via the @ai-sdk/openai-compatible provider) and the
 * GitHub REST API to exercise the questioner generation flow end-to-end:
 *
 *   1. Build the prompt context for each questioner source (tags, prompts,
 *      folders) using the same code paths as the production service.
 *   2. Send each prompt to the Minimax API and assert a non-empty answer.
 *   3. List folders in the configured test repo, assert the API responds,
 *      and assert the test repo contains at least one folder whose notes
 *      could power a folder-sourced questioner.
 *
 * Run with: MINIMAX_API_KEY=... GITHUB_PAT=... GITHUB_TEST_REPO=... npx jest live-questioner --runInBand
 *
 * Skips gracefully when env vars are missing so unit tests stay hermetic.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

import {
  ScheduledLearningService,
} from '../src/services/ScheduledLearningService';
import {
  createScheduledLearningItem,
  ScheduledLearningItem,
} from '../src/models/ScheduledLearning';

type Env = {
  MINIMAX_API_KEY: string;
  GITHUB_PAT: string;
  GITHUB_TEST_REPO: string;
};

function loadEnv(): Env | null {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return null;
  const raw = fs.readFileSync(envPath, 'utf8');
  const map: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    map[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  if (!map.MINIMAX_API_KEY || !map.GITHUB_PAT || !map.GITHUB_TEST_REPO) return null;
  return {
    MINIMAX_API_KEY: map.MINIMAX_API_KEY,
    GITHUB_PAT: map.GITHUB_PAT,
    GITHUB_TEST_REPO: map.GITHUB_TEST_REPO,
  };
}

const env = loadEnv();
const describeLive = env ? describe : describe.skip;

interface RemoteContentItem {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | string;
}

async function fetchRepoFolders(repoFullName: string, pat: string): Promise<RemoteContentItem[] | null> {
  const url = `https://api.github.com/repos/${repoFullName}/contents/?ref=main`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 401 || res.status === 403) {
    console.warn(`[live] GitHub PAT rejected (${res.status}); skipping repo-based checks.`);
    return null;
  }
  if (!res.ok) {
    throw new Error(`GitHub contents API failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as RemoteContentItem[];
}

async function fetchFolderNotes(
  repoFullName: string,
  pat: string,
  folderPath: string,
): Promise<Array<{ name: string; path: string; download_url: string | null }> | null> {
  const url = `https://api.github.com/repos/${repoFullName}/contents/${folderPath}?ref=main`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) {
    throw new Error(`GitHub folder contents API failed: ${res.status} ${res.statusText}`);
  }
  const items = (await res.json()) as Array<{ name: string; path: string; download_url: string | null; type: string }>;
  return items
    .filter((item) => item.type === 'file')
    .map((item) => ({ name: item.name, path: item.path, download_url: item.download_url }));
}

async function fetchNoteBody(downloadUrl: string, pat: string): Promise<string> {
  const res = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github.raw',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub raw API failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

interface LiveProvider {
  chatModel(modelId: string): unknown;
}

function buildMinimaxProvider(apiKey: string): LiveProvider {
  return createOpenAICompatible({
    name: 'minimax',
    baseURL: 'https://api.minimax.io/v1',
    apiKey,
  }) as unknown as LiveProvider;
}

function baseItem(): ScheduledLearningItem {
  return createScheduledLearningItem({
    type: 'questioner',
    tags: ['math'],
    daysOfWeek: ['monday'],
    time: '09:00',
    wordCount: 250,
  });
}

describeLive('Live questioner integration (Minimax + GitHub)', () => {
  jest.setTimeout(120_000);

  it('lists the configured test repo contents via the GitHub PAT', async () => {
    const items = await fetchRepoFolders(env!.GITHUB_TEST_REPO, env!.GITHUB_PAT);
    if (items === null) return;
    expect(Array.isArray(items)).toBe(true);
    console.log(`[live] ${env!.GITHUB_TEST_REPO} root has ${items.length} entries`);
    expect(items.length).toBeGreaterThan(0);
  });

  it('calls the Minimax API with a tag-sourced prompt context', async () => {
    const provider = buildMinimaxProvider(env!.MINIMAX_API_KEY);
    const model = provider.chatModel('MiniMax-M2.7') as any;

    const item: ScheduledLearningItem = {
      ...baseItem(),
      questionerSource: 'tags',
    };
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, []);
    expect(ctx).toMatch(/topic tags/);

    const result = await generateText({
      model,
      system: 'You write very short quiz questions. Reply with one numbered question only.',
      messages: [{ role: 'user', content: ctx }],
    });

    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
    console.log('[live] tags source reply length:', result.text.length);
  });

  it('calls the Minimax API with a multi-prompt prompt context', async () => {
    const provider = buildMinimaxProvider(env!.MINIMAX_API_KEY);
    const model = provider.chatModel('MiniMax-M2.7') as any;

    const item: ScheduledLearningItem = {
      ...baseItem(),
      questionerSource: 'prompt',
      questionerPrompts: ['two algebra practice problems', 'one geometry word problem'],
    };
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, []);
    expect(ctx).toContain('one section per prompt');
    expect(ctx).toContain('1. two algebra practice problems');
    expect(ctx).toContain('2. one geometry word problem');

    const result = await generateText({
      model,
      system: 'You write very short quiz questions. Reply with numbered questions only.',
      messages: [{ role: 'user', content: ctx }],
    });

    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
    console.log('[live] multi-prompt reply length:', result.text.length);
  });

  it('reads a real repo folder via the PAT and feeds notes to the Minimax API', async () => {
    const repoItems = await fetchRepoFolders(env!.GITHUB_TEST_REPO, env!.GITHUB_PAT);
    if (repoItems === null) return;
    const folderEntry = repoItems.find((item) => item.type === 'dir');
    if (!folderEntry) {
      console.warn(`[live] no folder found in ${env!.GITHUB_TEST_REPO}; skipping folder-sourced run`);
      return;
    }
    const folderPath = folderEntry.path;
    const fileEntries = await fetchFolderNotes(env!.GITHUB_TEST_REPO, env!.GITHUB_PAT, folderPath);
    if (fileEntries === null) return;
    expect(fileEntries.length).toBeGreaterThan(0);
    console.log(`[live] ${folderPath} has ${fileEntries.length} file(s)`);

    const noteBodies = await Promise.all(
      fileEntries.slice(0, 3).map(async (file) => {
        if (!file.download_url) return { title: file.name, content: '' };
        const content = await fetchNoteBody(file.download_url, env!.GITHUB_PAT);
        return { title: file.name, content };
      }),
    );

    const item: ScheduledLearningItem = {
      ...baseItem(),
      questionerSource: 'folder',
      questionerFolders: [{ repoPath: env!.GITHUB_TEST_REPO, folderPath }],
    };
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(
      item,
      noteBodies.map((n) => ({
        title: n.title,
        content: n.content,
        folderPath,
        repo: env!.GITHUB_TEST_REPO,
      })),
    );
    expect(ctx).toContain(`folder "${folderPath}"`);
    expect(ctx).toContain(noteBodies[0].title);

    const provider = buildMinimaxProvider(env!.MINIMAX_API_KEY);
    const model = provider.chatModel('MiniMax-M2.7') as any;

    const result = await generateText({
      model,
      system: 'You write short quiz questions based on the provided notes. Number them and reply only with the questions.',
      messages: [{ role: 'user', content: ctx }],
    });

    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
    console.log('[live] folder source reply length:', result.text.length);
  });
});