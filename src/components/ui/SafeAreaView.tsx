import {
  useCssElement,
  type StyledConfiguration,
  type StyledProps,
} from 'react-native-css';
import {
  SafeAreaView as BaseSafeAreaView,
  type SafeAreaViewProps,
} from 'react-native-safe-area-context';

const mapping = {
  className: 'style',
} as const satisfies StyledConfiguration<typeof BaseSafeAreaView>;

export function SafeAreaView(
  props: StyledProps<SafeAreaViewProps, typeof mapping>,
) {
  return useCssElement(BaseSafeAreaView, props, mapping);
}
