import { renderHook } from '@testing-library/react-native';
import { useNoteTags } from '../src/hooks/useNoteTags';

describe('useNoteTags', () => {
  test('merges metadata and inline tags', () => {
    const { result } = renderHook(() => useNoteTags(['alpha'], 'Hello #beta'));

    expect(result.current.allTags).toEqual(['alpha', 'beta']);
    expect(result.current.inlineOnly).toEqual(['beta']);
  });

  test('deduplicates tags case-insensitively', () => {
    const { result } = renderHook(() => useNoteTags(['Alpha', 'beta'], 'Note #alpha #BETA #gamma'));

    expect(result.current.allTags).toEqual(['alpha', 'beta', 'gamma']);
    expect(result.current.inlineOnly).toEqual(['gamma']);
  });

  test('keeps metadata-only tags in the merged list', () => {
    const { result } = renderHook(() => useNoteTags(['alpha', 'delta'], 'Body #alpha'));

    expect(result.current.allTags).toEqual(['alpha', 'delta']);
    expect(result.current.inlineOnly).toEqual([]);
  });

  test('returns empty arrays when nothing is tagged', () => {
    const { result } = renderHook(() => useNoteTags([], 'plain text'));

    expect(result.current.allTags).toEqual([]);
    expect(result.current.inlineOnly).toEqual([]);
  });
});
