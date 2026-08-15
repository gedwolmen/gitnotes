import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useTheme } from '../../contexts/ThemeContext';

export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (isConnected) return null;

  return (
    <View
      className="mx-4 mb-3 px-3.5 py-2.5 rounded-[14px] border"
      style={{ backgroundColor: `${colors.error}20`, borderColor: `${colors.error}33` }}
    >
      <Text className="text-sm font-semibold" style={{ color: colors.error }}>
        {t('sync.offlineBanner')}
      </Text>
    </View>
  );
}
