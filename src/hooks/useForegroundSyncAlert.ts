import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useForegroundSyncHealth } from './useForegroundSyncHealth';

export function useForegroundSyncAlert(): void {
  const health = useForegroundSyncHealth();
  const { t } = useTranslation();
  const alertedFailureStreak = useRef(false);

  useEffect(() => {
    if (health.status === 'ok') {
      alertedFailureStreak.current = false;
      return;
    }

    const failed = health.status === 'failed' || health.status === 'timedout';
    if (!failed || alertedFailureStreak.current) return;

    alertedFailureStreak.current = true;
    Alert.alert(
      t('settings.autoSyncFailedTitle'),
      t('settings.autoSyncFailedBody', { name: 'GitHub' }),
    );
  }, [health.status, t]);
}
