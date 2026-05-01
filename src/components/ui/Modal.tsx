import React, { ReactNode } from 'react';
import { Modal as RNModal, Pressable, StyleSheet, useWindowDimensions, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { Surface } from './Surface';
import { useTheme, useTokens } from '../../contexts/ThemeContext';

export interface ModalProps {
  visible: boolean;
  onRequestClose: () => void;
  dismissOnBackdrop?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
  fullWidth?: boolean;
}

export function Modal(props: ModalProps) {
  const { visible, onRequestClose, dismissOnBackdrop = true, contentStyle, children, fullWidth = false } = props;
  const { isDark } = useTheme();
  const { spacing, colors } = useTokens();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();

  const pad = spacing[5];
  const slotHeight = Math.max(0, viewportHeight - pad * 2);
  const slotWidth = Math.max(0, viewportWidth - pad * 2);

  return (
    <RNModal
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
          { backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center', padding: pad },
        ]}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            width: fullWidth ? slotWidth : undefined,
            maxWidth: 480,
            height: slotHeight,
            alignItems: 'stretch',
            justifyContent: 'center',
          }}
        >
          <Surface
            elevation="floating"
            radius="lg"
            style={[{ padding: pad, maxHeight: slotHeight, backgroundColor: colors.elevated }, contentStyle]}
          >
            {children}
          </Surface>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
