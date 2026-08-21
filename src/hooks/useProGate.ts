import { useCallback, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { selectIsPro, useProStore } from '../stores/proStore';
import type { RootStackParamList } from '../navigation/types';

/**
 * Returns true when the component is likely mounted inside a NavigationContainer.
 * useNavigation() throws when called outside a container, so this guard lets
 * callers (e.g. OnboardingScreen) use useProGate safely in both the main
 * navigator and the onboarding flow (which renders outside NavigationContainer).
 */
function useIsInNavigationContext(): boolean {
  try {
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    return true;
  } catch {
    return false;
  }
}

export function useProGate() {
  const isPro = useProStore(selectIsPro);
  const status = useProStore((s) => s.status);
  const isInNavigation = useIsInNavigationContext();
  const navigation = useRef<NativeStackNavigationProp<RootStackParamList> | null>(null);

  if (isInNavigation && !navigation.current) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    navigation.current = nav;
  }

  const openPaywall = useCallback(() => {
    if (navigation.current) {
      navigation.current.navigate('Paywall');
    }
  }, []);

  return { isPro, status, loading: status === 'loading', openPaywall };
}
