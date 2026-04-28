import React, { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { Surface } from './Surface';
import { useTheme, useTokens } from '../../contexts/ThemeContext';

export interface NModalProps {
  visible: boolean;
  onRequestClose: () => void;
  dismissOnBackdrop?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
  fullWidth?: boolean;
}

export function NModal(props: NModalProps) {
  const { visible, onRequestClose, dismissOnBackdrop = true, contentStyle, children, fullWidth = false } = props;
  const { isDark } = useTheme();
  const { spacing } = useTokens();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <BlurView
        intensity={40}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <Pressable
        onPress={dismissOnBackdrop ? onRequestClose : undefined}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center', padding: spacing[5] },
        ]}
      >
        <Pressable onPress={() => undefined} style={{ width: fullWidth ? '100%' : 'auto', maxWidth: 480 }}>
          <Surface
            elevation="floating"
            radius="lg"
            style={[{ padding: spacing[5] }, contentStyle]}
          >
            <View>{children}</View>
          </Surface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
