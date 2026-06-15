import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
          style={styles.icon}
        />
      </Pressable>

      <Modal
        visible={visible}
        onRequestClose={() => setVisible(false)}
        dismissOnBackdrop
        contentStyle={{ padding: spacing[6], paddingBottom: spacing[5] }}
      >
        <View style={styles.iconBadge}>
          <Ionicons
            name={iconName}
            size={20}
            color={colors.primary}
          />
        </View>

        <Text style={[styles.hintTitle, { color: colors.text }]}>
          {t('hints.title')}
        </Text>

        <Text style={[styles.hintText, { color: colors.text, fontSize: type.md }]}>
          {hintText}
        </Text>

        <TouchableOpacity
          testID={`${testID}-close`}
          onPress={() => setVisible(false)}
          style={[styles.okBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.okBtnText, { color: colors.surface }]}>
            {t('common.ok')}
          </Text>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  icon: {
    opacity: 0.7,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(123, 140, 222, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  hintTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  hintText: {
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  okBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  okBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});