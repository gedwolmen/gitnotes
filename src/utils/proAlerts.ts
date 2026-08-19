import { Alert } from 'react-native';
import type { TFunction } from 'i18next';

export function promptProUpgrade(t: TFunction, openPaywall: () => void): void {
  Alert.alert(t('pro.lockedTitle'), t('pro.lockedBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.upgrade'), onPress: openPaywall },
  ]);
}
