/**
 * Generic typed REST client for provider API calls.
 *
 * Handles auth header injection, JSON parsing, pagination,
 * and error classification. Each provider wraps this with
 * its own base URL and auth header format.
 */

export interface RestRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
}

export interface RestPaginatedResult<T> {
  data: T;
  nextUrl: string | null;
}

export class RestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'RestError';
  }
}

function parseNextLink(linkHeader: string | null | undefined): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

/**
 * Auth strategy: injects the correct header based on provider.
 */
export type AuthStrategy =
  | { type: 'bearer'; token: string }
  | { type: 'header'; header: string; value: string };

export class TypedRestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authStrategy: AuthStrategy | null,
  ) {}

  async request<T = unknown>(
    path: string,
    options: RestRequestOptions,
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.authStrategy) {
      if (this.authStrategy.type === 'bearer') {
        headers['Authorization'] = `Bearer ${this.authStrategy.token}`;
      } else {
        headers[this.authStrategy.header] = this.authStrategy.value;
      }
    }

    const init: RequestInit = {
      method: options.method,
      headers,
    };

    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, init);

    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      throw new RestError(
        `HTTP ${res.status} ${res.statusText} for ${url}`,
        res.status,
        body,
      );
    }

    if (res.status === 204) {
      return null as T;
    }

    return (await res.json()) as T;
  }

  async requestPaginated<T>(
    path: string,
    method: 'GET' = 'GET',
  ): Promise<T[]> {
    const all: T[] = [];
    let url: string | null = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    let pageCount = 0;

    while (url && pageCount < 20) {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (this.authStrategy) {
        if (this.authStrategy.type === 'bearer') {
          headers['Authorization'] = `Bearer ${this.authStrategy.token}`;
        } else {
          headers[this.authStrategy.header] = this.authStrategy.value;
        }
      }

      const res = await fetch(url, { method, headers });
      if (!res.ok) break;

      const data = (await res.json()) as unknown;
      if (Array.isArray(data)) {
        all.push(...(data as T[]));
      }

      const linkHeader = res.headers.get('link');
      url = parseNextLink(linkHeader);
      pageCount++;
    }

    return all;
  }
}
