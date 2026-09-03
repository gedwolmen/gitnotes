// Stub for missing GitLabService module
export interface GitLabService {
  isAuthenticated(): boolean;
}

export const stubGitLabService: GitLabService = {
  isAuthenticated: () => false,
};
