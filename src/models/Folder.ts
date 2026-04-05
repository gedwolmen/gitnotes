export interface Folder {
  id: string;
  name: string;
  path: string; // Absolute path like "/personal/ideas"
  parentId: string | null; // null for root folders
  createdAt: number;
  updatedAt: number;
}

export interface FolderCreateInput {
  name: string;
  parentId: string | null;
}

export interface FolderUpdateInput {
  id: string;
  name?: string;
  parentId?: string | null;
}

const ROOT_PATH = '/';

export function createFolder(input: FolderCreateInput, existingFolders: Folder[]): Folder {
  const now = Date.now();
  const id = generateFolderId();
  
  const parentPath = input.parentId
    ? existingFolders.find(f => f.id === input.parentId)?.path || ROOT_PATH
    : ROOT_PATH;
  
  const path = parentPath === ROOT_PATH 
    ? `/${input.name}` 
    : `${parentPath}/${input.name}`;
  
  return {
    id,
    name: input.name,
    path,
    parentId: input.parentId,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateFolder(existing: Folder, input: Partial<FolderCreateInput>): Folder {
  return {
    ...existing,
    name: input.name ?? existing.name,
    parentId: input.parentId ?? existing.parentId,
    updatedAt: Date.now(),
  };
}

function generateFolderId(): string {
  return `folder-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function getFolderDepth(folder: Folder): number {
  if (!folder.parentId) return 0;
  return folder.path.split('/').filter(Boolean).length - 1;
}

export function sortFoldersByName(folders: Folder[]): Folder[] {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name));
}

export function getChildFolders(folders: Folder[], parentId: string | null): Folder[] {
  return folders.filter(f => f.parentId === parentId);
}

export function getFolderPathParts(folder: Folder, allFolders: Folder[]): Folder[] {
  const parts: Folder[] = [folder];
  let current = folder;
  
  while (current.parentId) {
    const parent = allFolders.find(f => f.id === current.parentId);
    if (!parent) break;
    parts.unshift(parent);
    current = parent;
  }
  
  return parts;
}

export function getDescendantFolderIds(folder: Folder, allFolders: Folder[]): string[] {
  const children = getChildFolders(allFolders, folder.id);
  const descendantIds = children.map(c => c.id);
  
  for (const child of children) {
    descendantIds.push(...getDescendantFolderIds(child, allFolders));
  }
  
  return descendantIds;
}