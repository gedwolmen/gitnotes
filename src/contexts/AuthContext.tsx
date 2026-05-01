import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

  const refreshAuth = async () => {
    const state = await AuthService.checkAuthState();
    setAuthState(state);
  };

  const setToken = async (token: string): Promise<boolean> => {
    setIsLoading(true);
    const state = await AuthService.setToken(token);
    setAuthState(state);
    if (state.isAuthenticated) {
      await GitHubService.setToken(token);
    }
    setIsLoading(false);
    return state.isAuthenticated;
  };

  const clearToken = async () => {
    await AuthService.clearToken();
    await GitHubService.clearToken();
    setAuthState({ isAuthenticated: false, user: null, token: null });
  };

  useEffect(() => {
    refreshAuth()
      .then(() => GitHubService.initialize())
      .catch((err) => {
        console.warn('[AuthContext] auth bootstrap failed:', err);
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ authState, isLoading, refreshAuth, setToken, clearToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
