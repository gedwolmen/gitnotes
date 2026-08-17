import React, { ReactNode } from 'react';
import { Modal as RNModal, Pressable, StyleSheet, useWindowDimensions, View, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const { isDark } = useTheme();
  const { spacing, colors } = useTokens();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const { top: topInset } = useSafeAreaInsets();

  const pad = spacing[5];
  const slotHeight = Math.max(0, viewportHeight - pad * 2);
  const slotWidth = Math.max(0, viewportWidth - pad * 2);
  const bottomSheetSlotHeight = Math.max(0, slotHeight - topInset);

  const bgColor = colors.elevated;

  const surfaceStyle: ViewStyle = bottomSheet
    ? {
        backgroundColor: bgColor,
        maxHeight: bottomSheetSlotHeight,
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
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Pressable
        accessible={false}
        importantForAccessibility="no"
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
                  height: bottomSheetSlotHeight,
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
