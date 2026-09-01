// Stub for missing LocalGitWriter module
export interface LocalGitWriter {
  write(path: string, content: string): Promise<void>;
}

export const stubLocalGitWriter: LocalGitWriter = {
  write: async () => {},
};
