import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { githubActivity } from '../stores/githubActivityStore';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Per-request token override; replaces the module-level Authorization header for this call only. */
    authOverride?: string | null;
  }
}

const GITHUB_API_BASE = 'https://api.github.com';

const http: AxiosInstance = axios.create({
  baseURL: GITHUB_API_BASE,
  headers: {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  timeout: 120_000,
});

export function setAuthToken(token: string | null): void {
  if (token) {
    http.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete http.defaults.headers.common.Authorization;
  }
}

export function clearAuthToken(): void {
  delete http.defaults.headers.common.Authorization;
}

function labelForMethod(method?: string): string {
  const m = (method ?? 'get').toLowerCase();
  if (m === 'delete') return 'Deleting on GitHub…';
  if (m === 'put' || m === 'post' || m === 'patch') return 'Saving to GitHub…';
  return 'Syncing with GitHub…';
}

type TrackedConfig = InternalAxiosRequestConfig & {
  _activityTracked?: boolean;
  authOverride?: string | null;
};

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.headers.set('X-Request-ID', `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const tracked = config as TrackedConfig;
  if (typeof tracked.authOverride === 'string' && tracked.authOverride.length > 0) {
    config.headers.set('Authorization', `Bearer ${tracked.authOverride}`);
  }
  if (!tracked._activityTracked) {
    tracked._activityTracked = true;
    githubActivity.begin(labelForMethod(config.method));
  }
  return config;
});

function endIfTracked(config: TrackedConfig | undefined) {
  if (config?._activityTracked) {
    config._activityTracked = false;
    githubActivity.end();
  }
}

http.interceptors.response.use(
  (response) => {
    endIfTracked(response.config as TrackedConfig);
    return response;
  },
  (error: AxiosError) => {
    endIfTracked(error.config as TrackedConfig | undefined);
    const status = error.response?.status;
    // Prevent credential leaks in error messages
    const safeMessage = status
      ? `GitHub API error: ${status}`
      : error.message?.replace(/Bearer\s+\S+/gi, 'Bearer ***') ?? 'Network error';

    const normalized = new Error(safeMessage) as Error & { status?: number };
    normalized.status = status;
    throw normalized;
  },
);

export default http;
