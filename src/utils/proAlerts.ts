import { Alert } from 'react-native';
import type { TFunction } from 'i18next';

export function promptProUpgrade(t: TFunction, openPaywall: () => void, onCancel?: () => void): void {
  Alert.alert(t('pro.lockedTitle'), t('pro.lockedBody'), [
    { text: t('common.cancel'), style: 'cancel', onPress: onCancel },
    { text: t('common.upgrade'), onPress: openPaywall },
  ]);
}
