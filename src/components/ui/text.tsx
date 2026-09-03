import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { useTokens } from '../../contexts/ThemeContext';

export type TextProps = RNTextProps;

export function Text(props: RNTextProps) {
  return <RNText {...props} />;
}

export function ButtonText(props: RNTextProps) {
  const { colors } = useTokens();
  return (
    <RNText
      {...props}
      style={[{ color: colors.text }, props.style]}
    />
  );
}
