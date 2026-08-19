import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { selectIsPro, useProStore } from '../stores/proStore';
import type { RootStackParamList } from '../navigation/types';

export function useProGate() {
  const isPro = useProStore(selectIsPro);
  const status = useProStore((s) => s.status);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const openPaywall = useCallback(() => {
    navigation.navigate('Paywall');
  }, [navigation]);

  return { isPro, status, loading: status === 'loading', openPaywall };
}
