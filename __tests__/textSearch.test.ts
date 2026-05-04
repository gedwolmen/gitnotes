import { navigateToMatch, searchText, type MatchPosition } from "../src/utils/textSearch";

describe("textSearch", () => {
  it('finds all "hello" matches with correct positions', () => {
    expect(searchText("hello world hello", "hello")).toEqual<MatchPosition[]>([
      { start: 0, end: 5 },
      { start: 12, end: 17 },
    ]);
  });

  it("searches case-insensitively", () => {
    expect(searchText("Hello hELLo", "hello")).toEqual<MatchPosition[]>([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ]);
  });

  it("returns an empty array when there are no matches", () => {
    expect(searchText("hello world", "bye")).toEqual([]);
  });

  it("returns an empty array for an empty query", () => {
    expect(searchText("hello world", "")).toEqual([]);
  });

  it("treats regex special characters as literals", () => {
    expect(searchText("func() and func()", "func()")).toEqual<MatchPosition[]>([
      { start: 0, end: 6 },
      { start: 11, end: 17 },
    ]);
  });

  it("navigates to the requested match position", () => {
    const matches = searchText("hello world hello", "hello");

    expect(navigateToMatch(matches, 1)).toEqual({ start: 12, end: 17 });
  });
});
