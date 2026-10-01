export function getGraphContentTopInset(headerHeight: number): number {
  return Math.max(0, headerHeight);
}

export function getGraphViewportStyle(): { overflow: 'hidden' } {
  return { overflow: 'hidden' };
}
