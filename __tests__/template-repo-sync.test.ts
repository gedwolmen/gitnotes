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
import { useTemplateStore } from '../src/stores/templateStore';

describe('templateStore repo sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTemplateStore.setState({ customTemplates: [], pinnedIds: [], isLoading: false });
  });

  test('createTemplate stages the upsert to the templates repo', async () => {
    const t = await useTemplateStore.getState().createTemplate({
      name: 'X', icon: 'document-outline', description: '', content: 'body', tags: [],
    });
    expect(useTemplateStore.getState().customTemplates).toHaveLength(1);
    expect(t.isCustom).toBe(true);
  });

  test('updateTemplate stages the upsert with the merged template', async () => {
    await useTemplateStore.getState().createTemplate({
      name: 'X', icon: 'document-outline', description: '', content: 'body', tags: [],
    });
    const id = useTemplateStore.getState().customTemplates[0].id;
    await useTemplateStore.getState().updateTemplate(id, { content: 'new body' });
    expect(useTemplateStore.getState().customTemplates[0].content).toContain('new body');
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
    expect(useTemplateStore.getState().customTemplates).toHaveLength(0);
  });

  test('createTemplate persists locally without filePath when sync fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const t = await useTemplateStore.getState().createTemplate({
      name: 'Y', icon: 'document-outline', description: '', content: 'body', tags: [],
    });
    expect(useTemplateStore.getState().customTemplates).toHaveLength(1);
    warn.mockRestore();
  });
});
