import { checkGitHubRepoAccess } from '../src/services/git/repoAccessPreflight';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const token = 'secret-token';

describe('checkGitHubRepoAccess', () => {
  let fetchSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns verified write access from the accepted permissions header', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'x-accepted-github-permissions': 'contents:write' },
    }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toEqual({
      kind: 'ok',
      writeVerified: true,
    });
    expect(fetchSpy).toHaveBeenCalledWith('https://api.github.com/repos/octo/notes', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
  });

  it('returns write_unverified for read-only accepted permissions', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'x-accepted-github-permissions': 'contents:read' },
    }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({
      kind: 'write_unverified',
    });
  });

  it('falls back to permissions.push when the accepted permissions header is absent', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toEqual({
      kind: 'ok',
      writeVerified: true,
    });
  });

  it('returns write_unverified when permissions.push is false', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ permissions: { push: false } }), { status: 200 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({
      kind: 'write_unverified',
    });
  });

  it('returns write_unverified when GitHub provides no permissions information', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ private: true }), { status: 200 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({
      kind: 'write_unverified',
    });
  });

  it('returns no_access for a repository that is not visible', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 404 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'no_access' });
  });

  it('returns no_access when GitHub denies repository access', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ permissions: { push: false } }), { status: 403 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'no_access' });
  });

  it('returns no_access for a SAML-protected organization', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ message: 'SAML enforcement is required' }), { status: 403 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'no_access' });
  });

  it('returns transient for a rate-limited response', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 429 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'transient' });
  });

  it('returns transient for a network failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Network request failed'));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'transient' });
  });

  it('returns transient when the response body cannot be read', async () => {
    fetchSpy.mockResolvedValue({
      status: 200,
      ok: true,
      json: async (): Promise<unknown> => {
        throw new SyntaxError('invalid JSON');
      },
    });

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'transient' });
  });
});
