export type MatchPosition = {
  start: number;
  end: number;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const searchText = (text: string, query: string): MatchPosition[] => {
  if (!query) return [];

  const pattern = new RegExp(escapeRegExp(query), "gi");

  return Array.from(text.matchAll(pattern), (match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
};

export const navigateToMatch = (
  matches: MatchPosition[],
  index: number,
): MatchPosition => {
  if (matches.length === 0) {
    throw new RangeError("Cannot navigate when there are no matches.");
  }

  const normalizedIndex = ((index % matches.length) + matches.length) % matches.length;

  return matches[normalizedIndex];
};
