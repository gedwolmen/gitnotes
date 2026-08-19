import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
import { SafeAreaView } from '../ui/SafeAreaView';
import { useProGate } from '../../hooks/useProGate';
import { useTokens } from '../../contexts/ThemeContext';

export function ProRequired() {
  const { t } = useTranslation();
  const { openPaywall } = useProGate();
  const { colors } = useTokens();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="flex-1 items-center justify-center px-10" testID="pro-required">
        <Ionicons name="lock-closed" size={34} color={colors.textSecondary} />
        <Text className="text-xl font-bold mt-4 text-center" style={{ color: colors.text }}>
          {t('pro.gateTitle')}
        </Text>
        <Text className="text-sm mt-2 text-center" style={{ color: colors.textSecondary }}>
          {t('pro.gateBody')}
        </Text>
        <Button
          testID="pro-required.upgrade"
          variant="primary"
          label={t('common.upgrade')}
          onPress={openPaywall}
          style={{ marginTop: 18 }}
        />
      </View>
    </SafeAreaView>
  );
}
