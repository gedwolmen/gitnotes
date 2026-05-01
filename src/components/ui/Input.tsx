import React, { forwardRef, ReactNode, useState } from 'react';
import { StyleProp, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';
import { Surface } from './Surface';
import { useTokens } from '../../contexts/ThemeContext';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  leading?: ReactNode;
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  multilineMinHeight?: number;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(props, ref) {
  const {
    leading,
    trailing,
    containerStyle,
    inputStyle,
    multiline,
    multilineMinHeight = 96,
    onFocus,
    onBlur,
    placeholderTextColor,
    ...textInputProps
  } = props;
  const { colors, spacing, type } = useTokens();
  const [focused, setFocused] = useState(false);

  return (
    <Surface
      elevation="subtle"
      radius="md"
      inset
      style={[
        {
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          paddingHorizontal: spacing[3],
          paddingVertical: multiline ? spacing[3] : spacing[2],
          minHeight: multiline ? multilineMinHeight : 44,
          borderWidth: focused ? 1 : 0,
          borderColor: focused ? colors.accent : 'transparent',
        },
        containerStyle,
      ]}
    >
      {leading && <View style={{ marginRight: spacing[2] }}>{leading}</View>}
      <TextInput
        ref={ref}
        multiline={multiline}
        placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...textInputProps}
        style={[
          {
            flex: 1,
            color: colors.text,
            fontSize: type.md,
            paddingVertical: 0,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          inputStyle,
        ]}
      />
      {trailing && <View style={{ marginLeft: spacing[2] }}>{trailing}</View>}
    </Surface>
  );
});
