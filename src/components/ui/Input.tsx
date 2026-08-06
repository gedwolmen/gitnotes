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
  surfaceTestID?: string;
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
    surfaceTestID,
    ...textInputProps
  } = props;
  const { colors, spacing, type } = useTokens();
  const [focused, setFocused] = useState(false);

  return (
    <Surface
      elevation="subtle"
      radius="md"
      inset
      testID={surfaceTestID}
      style={[
        {
          paddingHorizontal: spacing[3],
          paddingVertical: multiline ? spacing[3] : spacing[2],
          minHeight: multiline ? multilineMinHeight : 44,
          borderWidth: focused ? 1 : 0,
          borderColor: focused ? colors.accent : 'transparent',
        },
        containerStyle,
      ]}
      className="flex-row items-center"
    >
      {leading && <View className="mr-2">{leading}</View>}
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
      {trailing && <View className="ml-2">{trailing}</View>}
    </Surface>
  );
});
