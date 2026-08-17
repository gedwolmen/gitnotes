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

  it('probes when accepted permissions are read-only and reports no_access on a forbidden probe', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', {
        status: 200,
        headers: { 'x-accepted-github-permissions': 'contents:read' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({
      kind: 'no_access',
    });
  });

  it('falls back to permissions.push when the accepted permissions header is absent', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toEqual({
      kind: 'ok',
      writeVerified: true,
    });
  });

  it('probes when permissions.push is false', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ permissions: { push: false } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({
      kind: 'no_access',
    });
  });

  it('probes when GitHub provides no permissions information and reports ok on a successful write probe', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ private: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toEqual({
      kind: 'ok',
      writeVerified: true,
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/contents/.gitnotes-preflight-'),
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/contents/.gitnotes-preflight-'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('reports no_access when the write probe is forbidden', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ private: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'no_access' });
  });

  it('reports transient when the write probe is rate-limited', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ private: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 429 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'transient' });
  });

  it('reports transient when the write probe hits a network failure', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ private: true }), { status: 200 }))
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'transient' });
  });

  it('still reports ok when probe cleanup fails', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ private: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toEqual({
      kind: 'ok',
      writeVerified: true,
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
