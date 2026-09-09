import * as FileSystem from 'expo-file-system/legacy';

import * as GitEngine from '@/services/git/engine/GitEngine';
import { CloneSyncService } from '@/services/cloneSyncServiceImpl';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  makeDirectoryAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  stage: jest.fn(),
  remove: jest.fn(),
}));

describe('CloneSyncService.save', () => {
  it('writes clone-mode saves without staging them', async () => {
    const result = await CloneSyncService.save({
      repoPath: 'owner/repo',
      branch: 'main',
      filePath: 'notes/example.md',
      content: '# Example',
      message: 'Update example',
      intent: 'upsert',
    });

    expect(result).toEqual({ success: true });
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///documents/GitNotes/owner/repo/notes/example.md',
      '# Example',
    );
    expect(GitEngine.stage).not.toHaveBeenCalled();
  });
});
