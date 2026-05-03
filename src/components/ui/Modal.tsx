import React, { ReactNode } from 'react';
import { Modal as RNModal, Pressable, StyleSheet, useWindowDimensions, View, ViewStyle, StyleProp } from 'react-native';
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
  bottomSheet?: boolean;
}

export function Modal(props: ModalProps) {
  const {
    visible,
    onRequestClose,
    dismissOnBackdrop = true,
    contentStyle,
    children,
    fullWidth = false,
    bottomSheet = false,
  } = props;
  const { isDark, glossy } = useTheme();
  const { spacing, colors } = useTokens();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();

  const pad = spacing[5];
  const slotHeight = Math.max(0, viewportHeight - pad * 2);
  const slotWidth = Math.max(0, viewportWidth - pad * 2);

  const bgColor = glossy ? colors.glassElevated : colors.elevated;

  const surfaceStyle: ViewStyle = bottomSheet
    ? {
        backgroundColor: bgColor,
        maxHeight: slotHeight,
        overflow: 'hidden',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      }
    : fullWidth
    ? {
        padding: pad,
        maxHeight: slotHeight,
        backgroundColor: bgColor,
        overflow: 'hidden',
      }
    : {
        padding: pad,
        maxHeight: slotHeight,
        backgroundColor: bgColor,
      };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType={bottomSheet ? 'slide' : 'fade'}
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
          bottomSheet
            ? {
                backgroundColor: 'rgba(0,0,0,0.18)',
                justifyContent: 'flex-end',
                alignItems: 'stretch',
              }
            : {
                backgroundColor: 'rgba(0,0,0,0.18)',
                alignItems: 'center',
                justifyContent: 'center',
                padding: pad,
              },
        ]}
      >
        <View
          pointerEvents="box-none"
          style={
            bottomSheet
              ? {
                  width: '100%',
                  height: slotHeight,
                  justifyContent: 'flex-end',
                }
              : {
                  width: fullWidth ? slotWidth : undefined,
                  maxWidth: 480,
                  height: slotHeight,
                  alignItems: 'stretch',
                  justifyContent: 'center',
                }
          }
        >
          <Surface
            elevation="floating"
            radius="lg"
            onStartShouldSetResponder={() => true}
            style={[surfaceStyle, contentStyle]}
          >
            {children}
          </Surface>
        </View>
      </Pressable>
    </RNModal>
  );
}
