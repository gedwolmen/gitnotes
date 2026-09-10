/**
 * CheckoutSafetyContext.tsx
 *
 * React context for checkout safety state in ExploreScreen.
 *
 * Provides:
 *   - isCheckingOut: true when GitBranchCoordinator state is 'checkout-running'
 *   - showBlockingOverlay: true when checkout is running (blocks user interaction)
 *
 * Components can use useCheckoutSafety() to access these values and
 * disable buttons/dropdowns during checkout to prevent conflicts.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { GitBranchCoordinator, type CoordinatorState } from '@/services/git/GitBranchCoordinator';

export interface CheckoutSafetyContextValue {
  isCheckingOut: boolean;
  showBlockingOverlay: boolean;
}

const CheckoutSafetyContext = createContext<CheckoutSafetyContextValue | null>(null);

interface CheckoutSafetyProviderProps {
  children: ReactNode;
}

export function CheckoutSafetyProvider({ children }: CheckoutSafetyProviderProps) {
  const [state, setState] = useState<CoordinatorState>(() => GitBranchCoordinator.getState());

  useEffect(() => {
    const unsubscribe = GitBranchCoordinator.onStateChange((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  const value: CheckoutSafetyContextValue = {
    isCheckingOut: state === 'checkout-running',
    showBlockingOverlay: state === 'checkout-running',
  };

  return (
    <CheckoutSafetyContext.Provider value={value}>
      {children}
    </CheckoutSafetyContext.Provider>
  );
}

export function useCheckoutSafety(): CheckoutSafetyContextValue {
  const context = useContext(CheckoutSafetyContext);
  if (context === null) {
    throw new Error('useCheckoutSafety must be used within a CheckoutSafetyProvider');
  }
  return context;
}
