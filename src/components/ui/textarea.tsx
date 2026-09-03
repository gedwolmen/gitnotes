import { TextInput, TextInputProps, View } from 'react-native';
import { useTokens } from '../../contexts/ThemeContext';

export const Textarea = View;

export function TextareaInput(props: TextInputProps) {
  const { colors, type } = useTokens();
  const isMultiline = Boolean(props.multiline);
  return (
    <TextInput
      {...props}
      placeholderTextColor={props.placeholderTextColor ?? colors.textSecondary}
      style={[
        {
          flex: 1,
          color: colors.text,
          fontSize: type.md,
          paddingVertical: 8,
          minHeight: isMultiline ? 96 : 44,
          textAlignVertical: isMultiline ? 'top' : 'center',
        },
        props.style,
      ]}
    />
  );
}
