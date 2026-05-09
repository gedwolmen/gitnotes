import type { AIProviderConfig } from '../../models/AIProvider';

export function filterProviders(
  providers: AIProviderConfig[],
  query: string,
): AIProviderConfig[] {
  const q = query.trim().toLowerCase();
  if (q === '') return providers;

  const result: AIProviderConfig[] = [];
  for (const provider of providers) {
    if (provider.name.toLowerCase().includes(q)) {
      result.push(provider);
      continue;
    }
    const matchedModels = provider.models.filter((m) =>
      m.name.toLowerCase().includes(q),
    );
    if (matchedModels.length > 0) {
      result.push({ ...provider, models: matchedModels });
    }
  }
  return result;
}
