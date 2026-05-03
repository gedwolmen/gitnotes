import React, { ReactNode, useMemo } from 'react';
import { Platform, StyleSheet, View, ViewProps, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme, useTokens } from '../../contexts/ThemeContext';
import {
  buildElevation,
  ElevationTier,
  Platform as TokenPlatform,
} from '../../theme/elevation';
import { Radius } from '../../theme/tokens';

export interface SurfaceProps extends Omit<ViewProps, 'style'> {
  elevation?: ElevationTier | 'flat';
  inset?: boolean;
  radius?: Radius;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
  glassLayer?: 'glassSurface' | 'glassCard' | 'glassElevated' | 'glassNav' | 'glassBorder';
}

function detectPlatform(): TokenPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export function Surface(props: SurfaceProps) {
  const { elevation = 'raised', inset = false, radius = 'md', style, children, testID, glassLayer = 'glassSurface', ...rest } = props;
  const { style: themeStyle, glossy, isDark } = useTheme();
  const { colors, radii } = useTokens();
  const platform = detectPlatform();

  const elevationStyles = useMemo(() => {
    if (elevation === 'flat') {
      return { outer: {}, inner: {} };
    }
    return buildElevation({
      tier: elevation,
      inset,
      style: themeStyle,
      colors,
      platform,
    });
  }, [elevation, inset, themeStyle, colors, platform]);

  const borderRadius = radii[radius];
  const baseStyle: ViewStyle = {
    backgroundColor: glossy ? colors[glassLayer] : colors.surface,
    borderRadius,
  };

  const webGlassStyle = glossy && platform === 'web' ? {
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  } : {};

  const androidOverlays = elevationStyles.androidOverlays;
  const showOverlays = platform === 'android' && androidOverlays !== undefined;

  const Wrapper = glossy && platform !== 'web' ? BlurView : View;
  const blurProps = glossy && platform !== 'web' ? {
    intensity: platform === 'ios' ? 60 : 30,
    tint: isDark ? 'dark' : 'light' as any,
  } : {};

  return (
    <Wrapper
      {...rest}
      testID={testID}
      {...blurProps}
      style={[
        baseStyle,
        elevationStyles.outer as ViewStyle,
        (glossy && platform === 'web') ? (webGlassStyle as ViewStyle) : undefined,
        style
      ]}
    >
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius }, elevationStyles.inner as ViewStyle]}
      />
      {showOverlays && androidOverlays && !glossy && (
        <AndroidShadowOverlays
          offset={androidOverlays.offset}
          blur={androidOverlays.blur}
          highlight={androidOverlays.highlight}
          shadow={androidOverlays.shadow}
          inset={androidOverlays.inset}
          radius={borderRadius}
        />
      )}
      {children}
    </Wrapper>
  );
}

interface AndroidOverlayProps {
  offset: number;
  blur: number;
  highlight: string;
  shadow: string;
  inset: boolean;
  radius: number;
}

function AndroidShadowOverlays(props: AndroidOverlayProps) {
  const { offset, blur, highlight, shadow, inset, radius } = props;
  const topLeftColor = inset ? shadow : highlight;
  const bottomRightColor = inset ? highlight : shadow;
  const drift = offset;
  const spread = blur;

  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -drift,
          left: -drift,
          right: drift,
          bottom: drift,
          backgroundColor: topLeftColor,
          opacity: 0.55,
          borderRadius: radius + spread / 2,
          zIndex: -1,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: drift,
          left: drift,
          right: -drift,
          bottom: -drift,
          backgroundColor: bottomRightColor,
          opacity: 0.55,
          borderRadius: radius + spread / 2,
          zIndex: -1,
        }}
      />
    </>
  );
}
