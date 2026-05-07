import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTokens } from '../contexts/ThemeContext';
import { useGitHubActivityStore } from '../stores/githubActivityStore';

export function GitHubActivityIndicator() {
  const { colors, radii, spacing, type } = useTokens();
  const inflight = useGitHubActivityStore((s) => s.inflight);
  const label = useGitHubActivityStore((s) => s.label);
  const visible = inflight > 0;

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : -12,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, translateY]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { opacity, transform: [{ translateY }] }]}
    >
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.pill,
              paddingVertical: spacing[2],
              paddingHorizontal: spacing[3],
              gap: spacing[2],
            },
          ]}
        >
          <ActivityIndicator size="small" color={colors.accent} />
          <Text
            style={{ color: colors.text, fontSize: type.sm, fontWeight: '600' }}
            numberOfLines={1}
          >
            {label ?? 'Syncing with GitHub…'}
          </Text>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 10,
  },
  safe: {
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
