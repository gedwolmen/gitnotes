import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const GITHUB_API_BASE = 'https://api.github.com';

const http: AxiosInstance = axios.create({
  baseURL: GITHUB_API_BASE,
  headers: {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
});

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) {
    http.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete http.defaults.headers.common.Authorization;
  }
}

export function clearAuthToken(): void {
  authToken = null;
  delete http.defaults.headers.common.Authorization;
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.headers.set('X-Request-ID', `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
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
