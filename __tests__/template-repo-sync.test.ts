jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    loadCustomTemplates: jest.fn(async () => []),
    loadTemplatePins: jest.fn(async () => []),
    saveCustomTemplates: jest.fn(async () => undefined),
    saveTemplatePins: jest.fn(async () => undefined),
  },
}));
jest.mock('../src/services/TemplateRepoPreferenceService', () => ({
  TemplateRepoPreferenceService: {
    get: jest.fn(async () => ({ repoPath: 'me/repo', branch: 'main' })),
  },
}));
jest.mock('../src/services/git/StagingService', () => ({
  StagingService: {
    stageUpsert: jest.fn(async () => ({ success: true })),
    stageDelete: jest.fn(async () => ({ success: true })),
  },
}));

import { useTemplateStore } from '../src/stores/templateStore';
import { StagingService } from '../src/services/git/StagingService';

describe('templateStore repo sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTemplateStore.setState({ customTemplates: [], pinnedIds: [], isLoading: false });
  });

  test('createTemplate stages the upsert to the templates repo', async () => {
    const t = await useTemplateStore.getState().createTemplate({
      name: 'X', icon: 'document-outline', description: '', content: 'body', tags: [],
    });
    expect(StagingService.stageUpsert).toHaveBeenCalledTimes(1);
    expect(StagingService.stageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'me/repo',
        branch: 'main',
        filePath: 'templates/x.md',
        title: 'X',
      }),
    );
    expect(useTemplateStore.getState().customTemplates).toHaveLength(1);
    expect(t.isCustom).toBe(true);
  });

  test('updateTemplate stages the upsert with the merged template', async () => {
    await useTemplateStore.getState().createTemplate({
      name: 'X', icon: 'document-outline', description: '', content: 'body', tags: [],
    });
    (StagingService.stageUpsert as jest.Mock).mockClear();
    const id = useTemplateStore.getState().customTemplates[0].id;
    await useTemplateStore.getState().updateTemplate(id, { content: 'new body' });
    expect(StagingService.stageUpsert).toHaveBeenCalledTimes(1);
    const arg = (StagingService.stageUpsert as jest.Mock).mock.calls[0][0] as { content: string };
    expect(arg.content).toContain('new body');
  });

  test('deleteTemplate stages the delete when filePath is known', async () => {
    useTemplateStore.setState({
      customTemplates: [
        {
          id: 'tpl-x',
          name: 'X',
          content: 'body',
          filePath: 'templates/x.md',
          isCustom: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      pinnedIds: [],
    });
    await useTemplateStore.getState().deleteTemplate('tpl-x');
    expect(StagingService.stageDelete).toHaveBeenCalledWith(expect.objectContaining({
      repo: 'me/repo', branch: 'main', filePath: 'templates/x.md', title: 'X',
    }));
  });

  test('createTemplate persists locally without filePath when staging fails', async () => {
    (StagingService.stageUpsert as jest.Mock).mockResolvedValueOnce({ success: false, error: 'GitHub unavailable' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const t = await useTemplateStore.getState().createTemplate({
      name: 'Y', icon: 'document-outline', description: '', content: 'body', tags: [],
    });
    expect(t.filePath).toBeUndefined();
    expect(useTemplateStore.getState().customTemplates).toHaveLength(1);
    expect(useTemplateStore.getState().customTemplates[0].filePath).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to stage template'));
    warn.mockRestore();
  });
});
