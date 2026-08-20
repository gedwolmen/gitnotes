import { useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useProGate } from './useProGate';
import type { RootStackParamList } from '../navigation/types';
import { promptProUpgrade } from '../utils/proAlerts';

/**
 * Screen-level Pro gate. Returns `blocked` (true while `status === 'loading' || !isPro`).
 *
 * When the screen is focused AND settled-free (status !== 'loading' AND !isPro),
 * fires the standard Pro upgrade alert each focus via the existing promptProUpgrade
 * utility. Cancel leaves the screen via goBack (MainTabs fallback for cold-deep-link
 * root stacks where canGoBack() is false). Upgrade navigates to the existing Paywall
 * screen.
 *
 * Optional `onBlockedLeave` fires immediately BEFORE either leave path (e.g. used by
 * ChatThreadListScreen to close a potentially-orphaned ChatRepoPicker modal — issue #924
 * edge-case E2).
 *
 * IMPORTANT for callers: `blocked` is TRUE during `loading` too, so screens render null
 * until Pro status settles. The alert is NEVER fired while loading (that would kick
 * paying users on cold-deep-link launch before RevenueCat resolves).
 */
export function useProScreenGuard(onBlockedLeave?: () => void): boolean {
  const { t } = useTranslation();
  const { isPro, status, openPaywall } = useProGate();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const blocked = status === 'loading' || !isPro;
  const settledFree = status !== 'loading' && !isPro;

  useFocusEffect(
    useCallback(() => {
      if (!settledFree) return;
      promptProUpgrade(
        t,
        () => {
          onBlockedLeave?.();
          openPaywall();
        },
        () => {
          onBlockedLeave?.();
          if (navigation.canGoBack()) navigation.goBack();
          else navigation.navigate('MainTabs');
        },
      );
    }, [settledFree, t, openPaywall, navigation, onBlockedLeave]),
  );

  return blocked;
}
