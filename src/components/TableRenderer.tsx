import React, { useMemo } from 'react';
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
const MIN_COL_WIDTH = 80;
const MAX_COL_WIDTH = 220;
const CELL_HORIZONTAL_PADDING = 16;
const CHAR_WIDTH_ESTIMATE = 7.5;

/**
 * Compute a fixed width per column from the longest cell text in that column,
 * clamped to [MIN_COL_WIDTH, MAX_COL_WIDTH]. Pinning every cell in a column
 * to the same width is what makes rows align in a grid — without this, each
 * row independently sized its cells from its own contents and columns
 * sawtoothed across rows.
 */
function computeColumnWidths(headers: string[], rows: string[][]): number[] {
  return headers.map((header, colIdx) => {
    let longest = header.length;
    for (const row of rows) {
      const cell = row[colIdx] ?? '';
      if (cell.length > longest) longest = cell.length;
    }
    const estimated = longest * CHAR_WIDTH_ESTIMATE + CELL_HORIZONTAL_PADDING;
    return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, estimated));
  });
}

export function TableRenderer({ headers, aligns, rows, isDark }: TableRendererProps) {
  const borderColor = isDark ? DARK_BORDER : LIGHT_BORDER;
  const colWidths = useMemo(() => computeColumnWidths(headers, rows), [headers, rows]);

  return (
    // Fixed column widths + horizontal scroll container. A table wider than
    // the viewport scrolls; cells within a column wrap at the same width so
    // rows stay grid-aligned.
    <ScrollView horizontal testID="table-scroll-view" showsHorizontalScrollIndicator>
      <View>
        <View style={styles.row}>
          {headers.map((header, colIdx) => (
            <Text
              key={colIdx}
              testID="table-header-cell"
              style={[
                styles.headerCell,
                { borderColor, width: colWidths[colIdx], textAlign: aligns[colIdx] ?? 'left' },
              ]}
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
                style={[
                  styles.cell,
                  { borderColor, width: colWidths[colIdx], textAlign: aligns[colIdx] ?? 'left' },
                ]}
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
  // alignItems:'stretch' makes every Text in a row take the row's tallest
  // height, so a column whose cell wrapped to two lines doesn't break the
  // row's bottom border alignment.
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cell: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    fontSize: 14,
  },
  headerCell: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    fontWeight: '600',
    fontSize: 14,
  },
});
