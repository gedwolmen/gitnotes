import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { selectIsPro, useProStore } from '../stores/proStore';
import type { RootStackParamList } from '../navigation/types';

/**
 * Pro status without navigation access. Safe to call outside a
 * NavigationContainer (OnboardingScreen, FloatingAIButton) — it never
 * touches the navigation context, so no useNavigation guard is needed.
 */
export function useProStatus() {
  const isPro = useProStore(selectIsPro);
  const status = useProStore((s) => s.status);
  return { isPro, status, loading: status === 'loading' };
}

export function useProGate() {
  const { isPro, status, loading } = useProStatus();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openPaywall = useCallback(() => {
    navigation.navigate('Paywall');
  }, [navigation]);
  return { isPro, status, loading, openPaywall };
}
