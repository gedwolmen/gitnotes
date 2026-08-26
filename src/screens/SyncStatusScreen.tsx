import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { ScreenHeader } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { useSafeBack } from '../hooks/useSafeBack';

interface SyncStatusScreenProps {
  onAiFixRemaining?: () => void;
}

export default function SyncStatusScreen({}: SyncStatusScreenProps = {}) {
  const { colors } = useTheme();
  const safeBack = useSafeBack();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title="Sync Status"
        onBack={safeBack}
      />

      <View className="flex-1 items-center justify-center">
        <Text className="text-base" style={{ color: colors.textSecondary }}>
          Sync status
        </Text>
      </View>
    </SafeAreaView>
  );
}
