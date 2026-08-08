import { describe, expect, it } from '@jest/globals';
import { parseChartLabels, parseChartValues } from '../src/utils/chartParsing';

describe('parseChartLabels', () => {
  it('parses comma-separated labels', () => {
    expect(parseChartLabels('A, B, C')).toEqual(['A', 'B', 'C']);
  });

  it('trims whitespace', () => {
    expect(parseChartLabels('  Foo  ,  Bar  , Baz ')).toEqual(['Foo', 'Bar', 'Baz']);
  });

  it('returns empty array for empty string', () => {
    expect(parseChartLabels('')).toEqual([]);
  });

  it('filters empty tokens from extra commas', () => {
    expect(parseChartLabels('A,,B, ,C')).toEqual(['A', 'B', 'C']);
  });

  it('handles single label', () => {
    expect(parseChartLabels('Only')).toEqual(['Only']);
  });
});

describe('parseChartValues', () => {
  it('parses comma-separated numbers', () => {
    expect(parseChartValues('10, 20, 30')).toEqual([10, 20, 30]);
  });

  it('returns 0 for non-numeric values', () => {
    expect(parseChartValues('10, abc, 30')).toEqual([10, 0, 30]);
  });

  it('returns 0 for Infinity', () => {
    expect(parseChartValues('Infinity, -Infinity, NaN')).toEqual([0, 0, 0]);
  });

  it('handles floats', () => {
    expect(parseChartValues('1.5, 2.7, 3.14')).toEqual([1.5, 2.7, 3.14]);
  });

  it('returns empty array for empty string', () => {
    expect(parseChartValues('')).toEqual([0]);
  });

  it('handles negative numbers', () => {
    expect(parseChartValues('-10, 20, -30.5')).toEqual([-10, 20, -30.5]);
  });
});
