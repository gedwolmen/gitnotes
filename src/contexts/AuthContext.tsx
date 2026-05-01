import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { AuthService, AuthState } from '../services/AuthService';
import { GitHubService } from '../services/GitHubService';

interface AuthContextType {
  authState: AuthState;
  isLoading: boolean;
  refreshAuth: () => Promise<void>;
  setToken: (token: string) => Promise<boolean>;
  clearToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    const state = await AuthService.checkAuthState();
    setAuthState(state);
  }, []);

  const setToken = useCallback(async (token: string): Promise<boolean> => {
    setIsLoading(true);
    const state = await AuthService.setToken(token);
    if (!state.isAuthenticated) {
      // Validation failed — keep prior auth state untouched so a typo
      // doesn't log the user out.
      setIsLoading(false);
      return false;
    }
    // Pass the user we just validated so GitHubService doesn't re-hit /user.
    // If the GitHubService write fails, roll AuthService back so the two
    // services don't disagree about who's logged in.
    const ghUser = await GitHubService.setToken(token, (state.user as unknown) as Parameters<typeof GitHubService.setToken>[1]);
    if (!ghUser) {
      await AuthService.clearToken();
      setAuthState({ isAuthenticated: false, user: null, token: null });
      setIsLoading(false);
      return false;
    }
    setAuthState(state);
    setIsLoading(false);
    return true;
  }, []);

  const clearToken = useCallback(async () => {
    await AuthService.clearToken();
    await GitHubService.clearToken();
    setAuthState({ isAuthenticated: false, user: null, token: null });
  }, []);

  useEffect(() => {
    refreshAuth()
      .then(() => GitHubService.initialize())
      .catch((err) => {
        console.warn('[AuthContext] auth bootstrap failed:', err);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo(
    () => ({ authState, isLoading, refreshAuth, setToken, clearToken }),
    [authState, isLoading, refreshAuth, setToken, clearToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
