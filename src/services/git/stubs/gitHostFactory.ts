// Stub for missing gitHostFactory module
export type GitHostProvider = 'github' | 'gitlab' | 'gitea' | 'forgejo';

export interface GitHostFactory {
  forProvider(provider: GitHostProvider): unknown;
}

export const gitHostFactory: GitHostFactory = {
  forProvider: () => ({}),
};
