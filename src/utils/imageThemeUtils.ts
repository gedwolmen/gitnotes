export function shouldInvertForDark(isDark: boolean): boolean {
  return isDark;
}

export function getSvgTint(isDark: boolean): string | undefined {
  return isDark ? '#f5f5f5' : undefined;
}

export function shouldApplyCaption(alt: string): boolean {
  return alt.trim().length > 0;
}

export function getCaptionText(alt: string): string {
  return alt.trim();
}
