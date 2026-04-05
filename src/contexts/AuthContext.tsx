import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthService, AuthState } from '../services/AuthService';

interface AuthContextType {
  authState: AuthState;
  isLoading: boolean;
  refreshAuth: () => Promise<void>;
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

  useEffect(() => {
    refreshAuth().finally(() => setIsLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ authState, isLoading, refreshAuth }}>
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