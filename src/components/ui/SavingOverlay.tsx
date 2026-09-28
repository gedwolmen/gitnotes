import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { useTheme, useTokens } from '../../contexts/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface SavingOverlayProps {
  visible: boolean;
  label?: string;
  testID?: string;
}

export function SavingOverlay({ visible, label, testID = 'saving-overlay' }: SavingOverlayProps) {
  const { isDark } = useTheme();
  const { colors, spacing, type } = useTokens();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(visible ? 1 : 0);
      return;
    }
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, opacity, reducedMotion]);

  return (
    <Animated.View
      testID={testID}
      pointerEvents={visible ? 'auto' : 'none'}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={label}
      style={[styles.root, { opacity }]}
    >
      <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.scrim} />
      <Pressable style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { gap: spacing[2] }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        {label ? (
          <Text style={{ color: colors.text, fontSize: type.sm, fontWeight: '600' }} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 10,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
