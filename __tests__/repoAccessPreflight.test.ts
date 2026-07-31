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

  it('returns ok for an accessible writable repository', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toEqual({ kind: 'ok' });
    expect(fetchSpy).toHaveBeenCalledWith('https://api.github.com/repos/octo/notes', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
  });

  it('returns ok when GitHub omits permissions', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ private: true }), { status: 200 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toEqual({ kind: 'ok' });
  });

  it('returns no_access for a repository that is not visible', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 404 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'no_access' });
  });

  it('returns no_write when the repository denies push permission', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ permissions: { push: false } }), { status: 403 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'no_write' });
  });

  it('returns saml_required for a SAML-protected organization', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ message: 'SAML enforcement is required' }), { status: 403 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'saml_required' });
  });

  it('returns rate_limited for a rate-limited response', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 429 }));

    await expect(checkGitHubRepoAccess('octo/notes', token)).resolves.toMatchObject({ kind: 'rate_limited' });
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
