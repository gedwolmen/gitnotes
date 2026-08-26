// Stub for deleted CloneMigrationService module

export interface MigrationFailure {
  kind: string;
  filePath: string;
  error: string;
}

export interface MigrationReport {
  notes: number;
  todos: number;
  canvases: number;
  templates: number;
  failures: MigrationFailure[];
}

export const CloneMigrationService = {
  migrateRepo: async (_repoPath: string, _branch: string): Promise<MigrationReport> => ({
    notes: 0,
    todos: 0,
    canvases: 0,
    templates: 0,
    failures: [],
  }),
};
