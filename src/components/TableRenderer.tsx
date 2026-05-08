import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Align = 'left' | 'center' | 'right';

interface TableRendererProps {
  headers: string[];
  aligns: Align[];
  rows: string[][];
  isDark: boolean;
}

const LIGHT_BORDER = '#D8D8D8';
const DARK_BORDER = '#262626';

export function TableRenderer({ headers, aligns, rows, isDark }: TableRendererProps) {
  const borderColor = isDark ? DARK_BORDER : LIGHT_BORDER;

  const cellStyle = [styles.cell, { borderColor }];
  const headerCellStyle = [styles.headerCell, { borderColor }];

  return (
    // showsHorizontalScrollIndicator + a scrollable container, so a table
    // wider than the viewport scrolls visibly instead of looking truncated.
    // `maxWidth` on cells lets long content wrap inside the cell rather
    // than running off the screen edge before the user realizes the table
    // is scrollable.
    <ScrollView horizontal testID="table-scroll-view" showsHorizontalScrollIndicator>
      <View>
        <View style={styles.row}>
          {headers.map((header, colIdx) => (
            <Text
              key={colIdx}
              testID="table-header-cell"
              style={[...headerCellStyle, { textAlign: aligns[colIdx] ?? 'left' }]}
            >
              {header}
            </Text>
          ))}
        </View>

        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.row}>
            {headers.map((_, colIdx) => (
              <Text
                key={colIdx}
                testID="table-cell"
                style={[...cellStyle, { textAlign: aligns[colIdx] ?? 'left' }]}
              >
                {row[colIdx] ?? ''}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  cell: {
    minWidth: 80,
    maxWidth: 220,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    fontSize: 14,
  },
  headerCell: {
    minWidth: 80,
    maxWidth: 220,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    fontWeight: '600',
    fontSize: 14,
  },
});
