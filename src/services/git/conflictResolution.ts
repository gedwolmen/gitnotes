import * as FileSystem from 'expo-file-system/legacy';

import type { GitRepository } from '../GitService';
import * as GitEngine from './engine/GitEngine';
import { GitFsService } from './GitFsService';
import { CommitService } from './CommitService';
import { syncNow } from './manualSync';

export type ConflictChoice = 'ours' | 'theirs' | 'both' | 'edit';

export function getConflictChoiceContent(
  blobs: GitEngine.ConflictBlobs,
  choice: ConflictChoice,
): string {
  switch (choice) {
    case 'ours':
      return blobs.ours;
    case 'theirs':
      return blobs.theirs;
    case 'both':
      return [blobs.ours, blobs.theirs].filter((content) => content.length > 0).join('\n');
    case 'edit': {
      const ours = blobs.ours.endsWith('\n') ? blobs.ours : `${blobs.ours}\n`;
      const theirs = blobs.theirs.endsWith('\n') ? blobs.theirs : `${blobs.theirs}\n`;
      return `<<<<<<< ours\n${ours}=======\n${theirs}>>>>>>> theirs\n`;
    }
  }
}

export async function resolveConflictAndSync(
  repo: GitRepository,
  filePath: string,
  content: string,
): Promise<void> {
  const localPath = GitFsService.workingTreeUri({ repoPath: repo.path });
  const fileUri = `${localPath}/${filePath}`;
  await FileSystem.writeAsStringAsync(fileUri, content);
  await GitEngine.markConflictResolved(localPath, filePath);

  const author = await CommitService.resolveAuthor();
  await GitEngine.commit(
    localPath,
    `Resolve conflict: ${filePath}`,
    author,
  );

  const pushResult = await GitEngine.push(localPath, 'origin', repo.id);
  if (!pushResult.ok) {
    throw new Error(pushResult.error ?? 'Failed to push resolved conflict');
  }

  const pullResult = await syncNow({ repos: [repo.path], source: 'manual' });
  if (!pullResult.ok) {
    throw new Error(pullResult.error ?? 'Resolved conflict pushed, but pull failed');
  }
}
