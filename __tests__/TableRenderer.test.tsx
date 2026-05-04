import React from 'react';
import { render } from '@testing-library/react-native';
import { TableRenderer } from '../src/components/TableRenderer';

describe('TableRenderer', () => {
  const headers = ['Name', 'Age'];
  const aligns: ('left' | 'center' | 'right')[] = ['left', 'right'];
  const rows = [
    ['Alice', '30'],
    ['Bob', '25'],
  ];

  it('renders headers', () => {
    const { getByText } = render(
      <TableRenderer headers={headers} aligns={aligns} rows={rows} isDark={false} />,
    );
    expect(getByText('Name')).toBeTruthy();
    expect(getByText('Age')).toBeTruthy();
  });

  it('renders row cells', () => {
    const { getByText } = render(
      <TableRenderer headers={headers} aligns={aligns} rows={rows} isDark={false} />,
    );
    expect(getByText('Alice')).toBeTruthy();
    expect(getByText('30')).toBeTruthy();
    expect(getByText('Bob')).toBeTruthy();
    expect(getByText('25')).toBeTruthy();
  });

  it('applies textAlign style per column alignment', () => {
    const { getAllByTestId } = render(
      <TableRenderer
        headers={['Left', 'Center', 'Right']}
        aligns={['left', 'center', 'right']}
        rows={[['a', 'b', 'c']]}
        isDark={false}
      />,
    );
    const headerCells = getAllByTestId('table-header-cell');
    expect(headerCells[0].props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ textAlign: 'left' })]),
    );
    expect(headerCells[1].props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ textAlign: 'center' })]),
    );
    expect(headerCells[2].props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ textAlign: 'right' })]),
    );
  });

  it('applies light border color in light mode', () => {
    const { getAllByTestId } = render(
      <TableRenderer headers={headers} aligns={aligns} rows={rows} isDark={false} />,
    );
    const cells = getAllByTestId('table-cell');
    const style = cells[0].props.style;
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flatStyle.borderColor).toBe('#D8D8D8');
  });

  it('applies dark border color in dark mode', () => {
    const { getAllByTestId } = render(
      <TableRenderer headers={headers} aligns={aligns} rows={rows} isDark={true} />,
    );
    const cells = getAllByTestId('table-cell');
    const style = cells[0].props.style;
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flatStyle.borderColor).toBe('#262626');
  });

  it('handles empty cells', () => {
    const { getAllByTestId } = render(
      <TableRenderer headers={['A', 'B']} aligns={['left', 'left']} rows={[['', '']]} isDark={false} />,
    );
    const cells = getAllByTestId('table-cell');
    expect(cells).toHaveLength(2);
  });

  it('pads rows with fewer columns than headers', () => {
    const { getAllByTestId } = render(
      <TableRenderer
        headers={['A', 'B', 'C']}
        aligns={['left', 'left', 'left']}
        rows={[['only one']]}
        isDark={false}
      />,
    );
    const cells = getAllByTestId('table-cell');
    expect(cells).toHaveLength(3);
  });

  it('wraps table in a horizontal ScrollView', () => {
    const { getByTestId } = render(
      <TableRenderer headers={headers} aligns={aligns} rows={rows} isDark={false} />,
    );
    const scrollView = getByTestId('table-scroll-view');
    expect(scrollView.props.horizontal).toBe(true);
  });
});
