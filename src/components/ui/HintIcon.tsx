import React, { useState } from 'react';
import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { useTokens } from '../../contexts/ThemeContext';

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface HintIconProps {
  hintKey: string;
  iconName?: IoniconName;
  testID?: string;
  iconSize?: number;
}

export function HintIcon(props: HintIconProps) {
  const { hintKey, iconName = 'information-circle-outline', testID, iconSize = 18 } = props;
  const { t } = useTranslation();
  const { colors, spacing, type } = useTokens();
  const [visible, setVisible] = useState(false);

  const hintText = t(hintKey);

  return (
    <>
      <Pressable
        testID={testID}
        hitSlop={6}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={hintText}
      >
        <Ionicons
          name={iconName}
          size={iconSize}
          color={colors.textSecondary}
          style={{ opacity: 0.7 }}
        />
      </Pressable>

      <Modal
        visible={visible}
        onRequestClose={() => setVisible(false)}
        dismissOnBackdrop
        contentStyle={{ padding: spacing[6], paddingBottom: spacing[5] }}
      >
        <View className="w-12 h-12 rounded-full items-center justify-center self-center mb-4"
          style={{ backgroundColor: 'rgba(123, 140, 222, 0.12)' }}
        >
          <Ionicons
            name={iconName}
            size={20}
            color={colors.primary}
          />
        </View>

        <Text className="text-xl font-bold text-center mb-3" style={{ color: colors.text }}>
          {t('hints.title')}
        </Text>

        <Text
          className="text-center mb-6 leading-6"
          style={{ color: colors.text, fontSize: type.md }}
        >
          {hintText}
        </Text>

        <TouchableOpacity
          testID={`${testID}-close`}
          onPress={() => setVisible(false)}
          className="py-3.5 rounded-xl items-center bg-primary"
        >
          <Text className="text-base font-semibold" style={{ color: colors.surface }}>
            {t('common.ok')}
          </Text>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
