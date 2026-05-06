import {
  EMPTY_RENDER_STYLE_SETTINGS,
  RENDER_FORMATS,
  RENDER_STYLE_PATH,
  emptyFormatStyle,
  mergeFormatStyle,
} from '../../src/types/RenderStyle';

jest.mock('../../src/services/GitHubService', () => ({
  __esModule: true,
  GitHubService: {
    getFileContent: jest.fn(),
    updateFile: jest.fn(),
    getFileSha: jest.fn(),
    getFileShaOrNull: jest.fn(),
    getRepositories: jest.fn(),
  },
}));

import { RenderStyleService } from '../../src/services/RenderStyleService';
import { GitHubService } from '../../src/services/GitHubService';

const mockGet = GitHubService.getFileContent as jest.Mock;
const mockPut = GitHubService.updateFile as jest.Mock;
const mockSha = GitHubService.getFileShaOrNull as jest.Mock;
const mockRepos = GitHubService.getRepositories as jest.Mock;

describe('RenderStyle types', () => {
  it('declares all three formats', () => {
    expect(RENDER_FORMATS).toEqual(['markdown', 'org', 'neorg']);
  });

  it('mergeFormatStyle deep-merges per-token', () => {
    const base = emptyFormatStyle();
    const merged = mergeFormatStyle(base, {
      h1: { color: '#ff0000' },
      codeBlock: { background: '#222' },
    });
    expect(merged.h1?.color).toBe('#ff0000');
    expect(merged.codeBlock?.background).toBe('#222');
  });

  it('EMPTY_RENDER_STYLE_SETTINGS has version 1 and empty formats', () => {
    expect(EMPTY_RENDER_STYLE_SETTINGS.version).toBe(1);
    expect(EMPTY_RENDER_STYLE_SETTINGS.formats).toEqual({});
  });
});

describe('RenderStyleService.load', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
  });

  it('returns empty settings when file is missing', async () => {
    mockGet.mockResolvedValueOnce(null);
    const out = await RenderStyleService.load({ owner: 'me', name: 'repo', branch: 'main' });
    expect(out.formats).toEqual({});
    expect(mockGet).toHaveBeenCalledWith('me', 'repo', RENDER_STYLE_PATH, 'main');
  });

  it('returns empty settings when JSON is malformed', async () => {
    mockGet.mockResolvedValueOnce('{ not json');
    const out = await RenderStyleService.load({ owner: 'me', name: 'repo', branch: 'main' });
    expect(out.formats).toEqual({});
  });

  it('parses well-formed settings', async () => {
    mockGet.mockResolvedValueOnce(
      JSON.stringify({ version: 1, formats: { markdown: { h1: { color: '#abcdef' } } } }),
    );
    const out = await RenderStyleService.load({ owner: 'me', name: 'repo', branch: 'main' });
    expect(out.formats.markdown?.h1?.color).toBe('#abcdef');
  });

  it('save calls updateFile with serialized JSON', async () => {
    mockPut.mockResolvedValueOnce({ commit: { sha: 'abc' }, content: { sha: 'def' } });
    const ok = await RenderStyleService.save(
      { owner: 'me', name: 'repo', branch: 'main' },
      { version: 1, formats: { neorg: { h2: { color: '#222222' } } } },
    );
    expect(ok).toBe(true);
    const args = mockPut.mock.calls[0];
    expect(args[0]).toBe('me');
    expect(args[1]).toBe('repo');
    expect(args[2]).toBe(RENDER_STYLE_PATH);
    const body = JSON.parse(args[3]);
    expect(body.formats.neorg.h2.color).toBe('#222222');
    expect(body.version).toBe(1);
  });

  it('discoverExisting only includes repos that have settings/render.json', async () => {
    mockRepos.mockResolvedValueOnce([
      { id: 1, name: 'a', owner: { login: 'me' }, full_name: 'me/a' },
      { id: 2, name: 'b', owner: { login: 'me' }, full_name: 'me/b' },
    ]);
    mockSha.mockImplementation(async (_owner: string, name: string) => {
      if (name === 'a') return 'sha-a';
      return null;
    });
    const found = await RenderStyleService.discoverExisting();
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('a');
    expect(found[0].label).toBe('me/a');
  });
});
