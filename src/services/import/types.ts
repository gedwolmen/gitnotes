export interface ImportedNote {
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  color?: string;
  pinned: boolean;
  folder?: string;
}

export interface ImportedFile {
  name: string;
  content: string;
  relativePath?: string;
}
