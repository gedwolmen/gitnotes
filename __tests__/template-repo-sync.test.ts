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
const mockSyncTemplateToGitHub = jest.fn(async () => ({ success: true, filePath: 'templates/x.md' }));
const mockDeleteTemplateFromGitHub = jest.fn(async () => ({ success: true }));
jest.mock('../src/services/TemplateGitHubSyncService', () => ({
  syncTemplateToGitHub: (...a: any[]) => mockSyncTemplateToGitHub(...a),
  deleteTemplateFromGitHub: (...a: any[]) => mockDeleteTemplateFromGitHub(...a),
}));

import { useTemplateStore } from '../src/stores/templateStore';

describe('templateStore repo sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTemplateStore.setState({ customTemplates: [], pinnedIds: [], isLoading: false });
  });

  test('createTemplate writes to GitHub and stores returned filePath', async () => {
    const t = await useTemplateStore.getState().createTemplate({
      name: 'X', icon: 'document-outline', description: '', content: 'body', tags: [],
    });
    expect(mockSyncTemplateToGitHub).toHaveBeenCalledTimes(1);
    expect(useTemplateStore.getState().customTemplates[0].filePath).toBe('templates/x.md');
    expect(t.filePath).toBe('templates/x.md');
  });

  test('updateTemplate calls sync with merged template', async () => {
    await useTemplateStore.getState().createTemplate({
      name: 'X', icon: 'document-outline', description: '', content: 'body', tags: [],
    });
    mockSyncTemplateToGitHub.mockClear();
    const id = useTemplateStore.getState().customTemplates[0].id;
    await useTemplateStore.getState().updateTemplate(id, { content: 'new body' });
    expect(mockSyncTemplateToGitHub).toHaveBeenCalledTimes(1);
    const arg = mockSyncTemplateToGitHub.mock.calls[0][0];
    expect(arg.template.content).toBe('new body');
  });

  test('deleteTemplate calls deleteTemplateFromGitHub when filePath is known', async () => {
    await useTemplateStore.getState().createTemplate({
      name: 'X', icon: 'document-outline', description: '', content: 'body', tags: [],
    });
    const id = useTemplateStore.getState().customTemplates[0].id;
    await useTemplateStore.getState().deleteTemplate(id);
    expect(mockDeleteTemplateFromGitHub).toHaveBeenCalledWith(expect.objectContaining({
      repoPath: 'me/repo', branch: 'main', filePath: 'templates/x.md', name: 'X',
    }));
  });
});
