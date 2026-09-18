import React, { ReactNode, useMemo } from 'react';
import { Platform, StyleSheet, View, ViewProps, ViewStyle, StyleProp } from 'react-native';
import { useTheme, useTokens } from '../../contexts/ThemeContext';
import {
  buildElevation,
  ElevationTier,
  Platform as TokenPlatform,
} from '../../theme/elevation';
import { Radius } from '../../theme/tokens';
import { cn } from '../../lib/utils';

export interface SurfaceProps extends Omit<ViewProps, 'style'> {
  elevation?: ElevationTier | 'flat';
  inset?: boolean;
  radius?: Radius;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}

const RADIUS_CLASS: Record<Radius, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  pill: 'rounded-full',
};

function detectPlatform(): TokenPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export function Surface(props: SurfaceProps) {
  const { elevation = 'raised', inset = false, radius = 'md', style, children, testID, className, ...rest } = props;
  const { style: themeStyle } = useTheme();
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
  const androidOverlays = elevationStyles.androidOverlays;
  const showOverlays = platform === 'android' && androidOverlays !== undefined;

  return (
    <View
      {...rest}
      testID={testID}
      className={cn(className, 'bg-surface', RADIUS_CLASS[radius])}
      style={[elevationStyles.outer as ViewStyle, style]}
    >
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius }, elevationStyles.inner as ViewStyle]}
      />
      {showOverlays && androidOverlays && (
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
    </View>
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
  const spread = blur;

  // Simulate iOS neumorphic shadows: dark outer shadow + light inner highlight
  // inset=true swaps shadow/highlight positions (pressed/inset effect)
  const [shadowTop, shadowLeft, shadowRight, shadowBottom] = inset
    ? [offset, offset, -offset, -offset]
    : [-offset, -offset, offset, offset];
  const [highlightTop, highlightLeft, highlightRight, highlightBottom] = inset
    ? [-offset, -offset, offset, offset]
    : [offset, offset, -offset, -offset];

  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: shadowTop,
          left: shadowLeft,
          right: shadowRight,
          bottom: shadowBottom,
          borderRadius: radius + spread / 2,
          backgroundColor: shadow,
          opacity: 0.25,
          zIndex: -1,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: highlightTop,
          left: highlightLeft,
          right: highlightRight,
          bottom: highlightBottom,
          borderRadius: radius + spread / 2,
          backgroundColor: highlight,
          opacity: 0.6,
          zIndex: -1,
        }}
      />
    </>
  );
}
