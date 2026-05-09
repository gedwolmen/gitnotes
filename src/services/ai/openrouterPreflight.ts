export interface OpenRouterKeyInfo {
  isFreeTier: boolean;
  limit: number | null;
  usage: number | null;
}

export function isOpenRouterBaseURL(baseURL: string): boolean {
  if (!baseURL) return false;
  try {
    const u = new URL(baseURL);
    return u.hostname.toLowerCase() === 'openrouter.ai';
  } catch {
    return false;
  }
}

export async function checkOpenRouterKey(
  baseURL: string,
  apiKey: string,
): Promise<OpenRouterKeyInfo | null> {
  if (!isOpenRouterBaseURL(baseURL)) return null;

  const url = baseURL.endsWith('/') ? `${baseURL}auth/key` : `${baseURL}/auth/key`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const data = (json as any)?.data;
    if (!data || typeof data !== 'object') return null;

    return {
      isFreeTier: Boolean(data.is_free_tier),
      limit: typeof data.limit === 'number' ? data.limit : null,
      usage: typeof data.usage === 'number' ? data.usage : null,
    };
  } catch {
    return null;
  }
}
