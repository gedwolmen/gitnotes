// Stub for deleted RepoImportService module

export const LARGE_REPO_THRESHOLD_KB = 50 * 1024;

export const importRepoAtAdd = async (
  _repoPath: string,
  _repoName: string,
  _onProgress: (phase: string, loaded: number, total: number | null) => void,
  _sizeKb?: number
) => ({ ok: true, largeRepo: false, error: '', retryable: false, counts: { notes: 0, todos: 0, canvases: 0, templates: 0 } });
