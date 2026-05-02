export type AIProviderType = 'apple' | 'llama' | 'openai-compatible';

export interface AIModelConfig {
  id: string;
  name: string;
  providerId: string;
  providerType: AIProviderType;
  requiresDownload: boolean;
  downloadSize?: string;
  isDownloaded?: boolean;
}

export interface AIProviderConfig {
  id: string;
  type: AIProviderType;
  name: string;
  baseURL?: string;
  apiKey?: string;
  isEnabled: boolean;
  models: AIModelConfig[];
  addedAt: number;
}

export type AIActionMode = 'auto' | 'confirm';

export interface AISettings {
  isEnabled: boolean;
  selectedModelId: string | null;
  actionMode: AIActionMode;
  chatRepoOwner: string | null;
  chatRepoName: string | null;
  chatRepoBranch: string;
  providers: AIProviderConfig[];
}

export interface AIContextItem {
  type: 'file' | 'folder' | 'repo' | 'local-notes' | 'local-todos';
  owner: string;
  repo: string;
  path: string;
  name: string;
}
