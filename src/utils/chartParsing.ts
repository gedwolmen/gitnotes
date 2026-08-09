/**
 * Parse comma-separated chart labels from user input.
 * Splits on comma, trims whitespace, filters empty tokens.
 */
export function parseChartLabels(input: string): string[] {
  return input.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Parse comma-separated chart values from user input.
 * Splits on comma, trims, parses as float.
 * Returns 0 for NaN, Infinity, -Infinity, or non-numeric values.
 */
export function parseChartValues(input: string): number[] {
  return input.split(',').map(s => {
    const n = parseFloat(s.trim());
    return Number.isFinite(n) ? n : 0;
  });
}
