// Stub for deleted NoteSyncQueueService module

export interface NoteDeleteParams {
  repo: string;
  branch: string;
  filePath: string;
  title?: string;
  accountId?: string;
  localNoteId?: string;
}

export const NoteSyncQueueService = {
  enqueueNoteUpsert: async (_params: {
    repo: string;
    branch: string;
    filePath: string;
    title: string;
    content: string;
  }, _id?: string) => {},
  enqueueNoteDelete: async (_params: NoteDeleteParams) => {},
  enqueueNoteDeletes: async (_params: NoteDeleteParams[]) => {},
};
