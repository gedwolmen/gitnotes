import React, { ReactNode, useMemo } from 'react';
import { Platform, StyleSheet, View, ViewProps, ViewStyle, StyleProp } from 'react-native';
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
}

function detectPlatform(): TokenPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export function Surface(props: SurfaceProps) {
  const { elevation = 'raised', inset = false, radius = 'md', style, children, testID, ...rest } = props;
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
  const baseStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius,
  };

  const androidOverlays = elevationStyles.androidOverlays;
  const showOverlays = platform === 'android' && androidOverlays !== undefined;

  return (
    <View
      {...rest}
      testID={testID}
      style={[baseStyle, elevationStyles.outer as ViewStyle, style]}
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
  const shadowColor = inset ? shadow : highlight;
  const highlightColor = inset ? highlight : shadow;
  const thickness = offset;
  const spread = blur;

  return (
    <>
      {/* Top shadow - extends above element */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -thickness,
          left: 0,
          right: 0,
          height: thickness,
          backgroundColor: shadowColor,
          opacity: 0.2,
        }}
      />
      {/* Bottom shadow - extends below element */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -thickness,
          left: 0,
          right: 0,
          height: thickness,
          backgroundColor: shadowColor,
          opacity: 0.2,
        }}
      />
      {/* Left shadow */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: -thickness,
          bottom: 0,
          width: thickness,
          backgroundColor: shadowColor,
          opacity: 0.2,
        }}
      />
      {/* Right shadow */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: -thickness,
          bottom: 0,
          width: thickness,
          backgroundColor: shadowColor,
          opacity: 0.2,
        }}
      />
    </>
  );
}
