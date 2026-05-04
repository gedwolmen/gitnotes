jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

jest.mock('../src/services/TemplateRepoPreferenceService', () => ({
  TemplateRepoPreferenceService: { get: jest.fn(async () => null) },
}));
jest.mock('../src/services/TemplateGitHubSyncService', () => ({
  syncTemplateToGitHub: jest.fn(async () => ({ success: true })),
  deleteTemplateFromGitHub: jest.fn(async () => ({ success: true })),
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    loadCustomTemplates: jest.fn(async () => []),
    loadTemplatePins: jest.fn(async () => []),
    saveCustomTemplates: jest.fn(async () => undefined),
    saveTemplatePins: jest.fn(async () => undefined),
  },
}));

import { NOTE_TEMPLATES } from '../src/services/TemplateService';
import { StorageService } from '../src/services/StorageService';
import { useTemplateStore } from '../src/stores/templateStore';

describe('custom templates store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTemplateStore.setState({ customTemplates: [], pinnedIds: [], isLoading: false });
  });

  test('createTemplate adds to customTemplates', async () => {
    const template = await useTemplateStore.getState().createTemplate({
      name: 'Custom',
      icon: 'document-outline',
      description: 'desc',
      content: 'body',
      tags: ['x'],
    });

    expect(template.isCustom).toBe(true);
    expect(useTemplateStore.getState().customTemplates).toHaveLength(1);
    expect(StorageService.saveCustomTemplates).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'Custom' })]));
  });

  test('deleteTemplate removes custom templates but not built-ins', async () => {
    const custom = await useTemplateStore.getState().createTemplate({
      name: 'Custom',
      icon: 'document-outline',
      description: 'desc',
      content: 'body',
      tags: [],
    });

    await useTemplateStore.getState().deleteTemplate(custom.id);
    await useTemplateStore.getState().deleteTemplate(NOTE_TEMPLATES[0].id);

    expect(useTemplateStore.getState().customTemplates).toHaveLength(0);
    expect(StorageService.saveCustomTemplates).toHaveBeenCalledTimes(2);
  });

  test('togglePin adds and removes ids', async () => {
    await useTemplateStore.getState().togglePin('blank');
    expect(useTemplateStore.getState().pinnedIds).toEqual(['blank']);

    await useTemplateStore.getState().togglePin('blank');
    expect(useTemplateStore.getState().pinnedIds).toEqual([]);
    expect(StorageService.saveTemplatePins).toHaveBeenCalledTimes(2);
  });

  test('getAllTemplates merges built-ins and custom with pinned first', async () => {
    await useTemplateStore.getState().createTemplate({
      name: 'Custom',
      icon: 'document-outline',
      description: 'desc',
      content: 'body',
      tags: [],
    });
    await useTemplateStore.getState().togglePin('blank');

    const all = useTemplateStore.getState().getAllTemplates();
    expect(all[0].id).toBe('blank');
    expect(all.some((t) => t.name === 'Custom')).toBe(true);
    expect(all.some((t) => t.id === 'blank' && t.isPinned)).toBe(true);
  });
});
