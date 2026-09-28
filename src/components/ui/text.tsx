import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { useTokens } from '../../contexts/ThemeContext';
import { TYPE, TEXT_ROLE_SIZE, TEXT_ROLE_LINE_HEIGHT, type TextRole } from '../../theme/tokens';

export type TextProps = RNTextProps;

export interface StyledTextProps extends TextProps {
  textRole?: TextRole;
}

export function Text(props: StyledTextProps) {
  const { textRole, style, ...rest } = props;
  if (textRole) {
    const sizeKey = TEXT_ROLE_SIZE[textRole];
    const lineHeight = TEXT_ROLE_LINE_HEIGHT[textRole];
    return <RNText {...rest} style={[{ fontSize: TYPE[sizeKey], lineHeight }, style]} />;
  }
  return <RNText {...props} />;
}

export function ButtonText(props: RNTextProps) {
  const { colors } = useTokens();
  return <RNText {...props} style={[{ color: colors.text }, props.style]} />;
}
