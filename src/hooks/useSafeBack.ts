import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

/**
 * Header-back handler that never dispatches an unhandled GO_BACK action.
 *
 * Screens reachable as the ROOT of the root stack (deep links such as
 * `gitnotes://chat`, `gitnotes://note/:noteId`, `gitnotes://stage`) have no
 * previous screen; an unguarded `navigation.goBack()` there throws
 * "The action 'GO_BACK' was not handled by any navigator." When there is a
 * previous screen it pops normally; otherwise it falls back to MainTabs (the
 * same fallback `useProScreenGuard` uses for cold-deep-link cancel).
 */
export function useSafeBack(): () => void {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);
}
