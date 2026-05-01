import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitHubService, GitHubRepository, GitHubContent, GitHubIssue, GitHubPullRequest, GitHubMilestone } from '../services/GitHubService';

const STALE_TIMES = {
  repos: 5 * 60 * 1000,
  contents: 2 * 60 * 1000,
  file: 5 * 60 * 1000,
  tree: 5 * 60 * 1000,
  issues: 60 * 1000,
  prs: 60 * 1000,
  milestones: 60 * 1000,
  user: 10 * 60 * 1000,
} as const;

export function useGitHubRepos() {
  return useQuery({
    queryKey: ['github', 'repos'],
    queryFn: () => GitHubService.getRepositories(),
    staleTime: STALE_TIMES.repos,
  });
}

export function useGitHubRepoContents(owner: string, repo: string, path: string = '', branch?: string) {
  return useQuery({
    queryKey: ['github', 'contents', owner, repo, path, branch],
    queryFn: () => GitHubService.getRepoContents(owner, repo, path, branch),
    staleTime: STALE_TIMES.contents,
  });
}

export function useGitHubFileContent(owner: string, repo: string, path: string, branch?: string) {
  return useQuery({
    queryKey: ['github', 'file', owner, repo, path, branch],
    queryFn: () => GitHubService.getFileContent(owner, repo, path, branch),
    staleTime: STALE_TIMES.file,
  });
}

export function useGitHubTree(owner: string, repo: string, branch?: string) {
  return useQuery({
    queryKey: ['github', 'tree', owner, repo, branch],
    queryFn: () => GitHubService.getTreeRecursive(owner, repo, branch || 'main'),
    staleTime: STALE_TIMES.tree,
  });
}

export function useGitHubIssues(owner: string, repo: string) {
  return useQuery({
    queryKey: ['github', 'issues', owner, repo],
    queryFn: () => GitHubService.getIssues(owner, repo),
    staleTime: STALE_TIMES.issues,
  });
}

export function useGitHubPullRequests(owner: string, repo: string) {
  return useQuery({
    queryKey: ['github', 'prs', owner, repo],
    queryFn: () => GitHubService.getPullRequests(owner, repo),
    staleTime: STALE_TIMES.prs,
  });
}

export function useGitHubMilestones(owner: string, repo: string) {
  return useQuery({
    queryKey: ['github', 'milestones', owner, repo],
    queryFn: () => GitHubService.getMilestones(owner, repo),
    staleTime: STALE_TIMES.milestones,
  });
}

export function useGitHubUser() {
  return useQuery({
    queryKey: ['github', 'user'],
    queryFn: () => GitHubService.getUser(),
    staleTime: STALE_TIMES.user,
  });
}

export function useGitHubFileSha(owner: string, repo: string, path: string, branch?: string) {
  return useQuery({
    queryKey: ['github', 'sha', owner, repo, path, branch],
    queryFn: () => GitHubService.getFileSha(owner, repo, path, branch),
    staleTime: Infinity,
  });
}

export function useCreateFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { owner: string; repo: string; path: string; content: string; message: string; branch: string }) =>
      GitHubService.createFile(params.owner, params.repo, params.path, params.content, params.message, params.branch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['github', 'contents', variables.owner, variables.repo] });
      qc.invalidateQueries({ queryKey: ['github', 'tree', variables.owner, variables.repo] });
    },
  });
}

export function useUpdateFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { owner: string; repo: string; path: string; content: string; message: string; branch: string }) =>
      GitHubService.updateFile(params.owner, params.repo, params.path, params.content, params.message, params.branch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['github', 'contents', variables.owner, variables.repo] });
      qc.invalidateQueries({ queryKey: ['github', 'file', variables.owner, variables.repo, variables.path] });
      qc.invalidateQueries({ queryKey: ['github', 'tree', variables.owner, variables.repo] });
    },
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { owner: string; repo: string; path: string; message: string; sha: string; branch: string }) =>
      GitHubService.deleteFile(params.owner, params.repo, params.path, params.message, params.sha, params.branch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['github', 'contents', variables.owner, variables.repo] });
      qc.invalidateQueries({ queryKey: ['github', 'tree', variables.owner, variables.repo] });
    },
  });
}

export function useMoveFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { owner: string; repo: string; oldPath: string; newPath: string; content: string; message: string; sha: string; branch: string }) =>
      GitHubService.moveFile(params.owner, params.repo, params.oldPath, params.newPath, params.content, params.message, params.sha, params.branch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['github', 'contents', variables.owner, variables.repo] });
      qc.invalidateQueries({ queryKey: ['github', 'tree', variables.owner, variables.repo] });
    },
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { owner: string; repo: string; path: string; branch: string }) =>
      GitHubService.createFolder(params.owner, params.repo, params.path, params.branch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['github', 'contents', variables.owner, variables.repo] });
      qc.invalidateQueries({ queryKey: ['github', 'tree', variables.owner, variables.repo] });
    },
  });
}

export function useInvalidateGitHubQueries() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['github'] });
}
