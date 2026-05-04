import { markdownTestCases } from './helpers/markdownTestCases';
import { parseTables, type TableSegment } from '../src/utils/tableParser';

describe('parseTables', () => {
  test('parses a simple 2-column table', () => {
    const result = parseTables(markdownTestCases.gfmTable);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject<TableSegment>({
      headers: ['Name', 'Value'],
      aligns: ['left', 'left'],
      rows: [
        ['Alpha', '1'],
        ['Beta', '2'],
      ],
      startIndex: 0,
      endIndex: markdownTestCases.gfmTable.length,
    });
  });

  test('parses alignment markers from the separator row', () => {
    const input = [
      '| Left | Center | Right | Default |',
      '| :--- | :---: | ---: | --- |',
      '| a | b | c | d |',
    ].join('\n');

    const result = parseTables(input);

    expect(result).toHaveLength(1);
    expect(result[0]?.aligns).toEqual(['left', 'center', 'right', 'left']);
  });

  test('preserves inline formatting inside cells', () => {
    const input = [
      '| Label | Body |',
      '| --- | --- |',
      '| **Bold** | `code` and *italic* |',
    ].join('\n');

    const result = parseTables(input);

    expect(result).toHaveLength(1);
    expect(result[0]?.rows[0]).toEqual(['**Bold**', '`code` and *italic*']);
  });

  test('pads shorter rows to the header width', () => {
    const input = [
      '| A | B | C |',
      '| --- | --- | --- |',
      '| 1 | 2 |',
      '| 3 | 4 | 5 | 6 |',
    ].join('\n');

    const result = parseTables(input);

    expect(result).toHaveLength(1);
    expect(result[0]?.rows[0]).toEqual(['1', '2', '']);
    expect(result[0]?.rows[1]).toEqual(['3', '4', '5', '6']);
  });

  test('returns an empty array when no table exists', () => {
    const input = 'Just a paragraph\n| not a table |';

    expect(parseTables(input)).toEqual([]);
  });

  test('parses multiple tables in one document', () => {
    const first = [
      '| Name | Value |',
      '| --- | --- |',
      '| Alpha | 1 |',
    ].join('\n');
    const second = [
      '| Key | Result |',
      '| --- | --- |',
      '| Beta | 2 |',
    ].join('\n');
    const input = ['Intro', first, 'Middle', second, 'Outro'].join('\n\n');

    const result = parseTables(input);

    expect(result).toHaveLength(2);
    expect(result[0]?.startIndex).toBe(input.indexOf(first));
    expect(result[0]?.endIndex).toBe(input.indexOf(first) + first.length);
    expect(result[1]?.startIndex).toBe(input.indexOf(second));
    expect(result[1]?.endIndex).toBe(input.indexOf(second) + second.length);
  });
});
