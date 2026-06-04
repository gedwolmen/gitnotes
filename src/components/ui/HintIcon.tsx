import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { useTokens } from '../../contexts/ThemeContext';

export interface HintIconProps {
  hintKey: string;
  iconName?: string;
  testID?: string;
}

export function HintIcon(props: HintIconProps) {
  const { hintKey, iconName = 'information-circle-outline', testID } = props;
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
          name={iconName as any}
          size={18}
          color={colors.textSecondary}
          style={styles.icon}
        />
      </Pressable>

      <Modal
        visible={visible}
        onRequestClose={() => setVisible(false)}
        dismissOnBackdrop
        contentStyle={{ padding: spacing[5], paddingBottom: spacing[6] }}
      >
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons
              name={iconName as any}
              size={24}
              color={colors.primary}
            />
          </View>
          <TouchableOpacity
            onPress={() => setVisible(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    padding: 4,
  },
  hintText: {
    lineHeight: 22,
    marginBottom: 20,
  },
  okBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  okBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});