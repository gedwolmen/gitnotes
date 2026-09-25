import { Text as RNText, TextProps } from 'react-native';
import { useTokens } from '../../contexts/ThemeContext';

export type HeadingProps = TextProps;

export function Heading(props: HeadingProps) {
  const { type } = useTokens();
  return <RNText {...props} style={[{ fontSize: type.xl, fontWeight: '600' }, props.style]} />;
}
