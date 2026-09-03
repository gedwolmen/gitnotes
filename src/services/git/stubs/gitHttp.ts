// Stub for missing gitHttp module
export interface GitHttp {
  fetch(url: string, options?: unknown): Promise<unknown>;
}

export const gitHttp: GitHttp = {
  fetch: async () => undefined,
};
