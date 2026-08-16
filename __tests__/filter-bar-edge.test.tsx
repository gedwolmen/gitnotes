import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { FilterBar, FilterChip } from '../src/components/FilterBar';

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      primary: '#2563eb',
      border: '#d1d5db',
      textSecondary: '#6b7280',
    },
  }),
}));

const filters: FilterChip[] = [
  { id: 'tag-1', label: 'Work', type: 'tag' },
  { id: 'tag-2', label: 'Personal', type: 'tag' },
];

function renderFilterBar() {
  return render(
    <FilterBar filters={filters} onRemoveFilter={jest.fn()} onClearAll={jest.fn()} />,
  );
}

describe('FilterBar edge-to-edge layout', () => {
  it('renders the wrap with no horizontal margin', () => {
    const { getByTestId } = renderFilterBar();

    const wrapStyle = StyleSheet.flatten(getByTestId('filter-bar.filter.change').props.style);

    expect(wrapStyle.marginHorizontal).toBe(0);
    expect(wrapStyle.marginLeft ?? 0).toBe(0);
    expect(wrapStyle.marginRight ?? 0).toBe(0);
    expect(wrapStyle.marginTop).toBe(4);
    expect(wrapStyle.marginBottom).toBe(4);
  });

  it('insets the chip row with symmetric side padding so the first chip is not flush on load', () => {
    const { getByTestId } = renderFilterBar();

    const scroll = getByTestId('filter-bar.row');
    const rowStyle = StyleSheet.flatten(scroll.props.contentContainerStyle);

    expect(rowStyle.marginLeft ?? 0).toBe(0);
    expect(rowStyle.marginRight ?? 0).toBe(0);
    expect(rowStyle.paddingHorizontal).toBe(12);
    expect(rowStyle.gap).toBe(6);
  });
});
