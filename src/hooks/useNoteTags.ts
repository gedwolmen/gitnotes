import { useMemo } from 'react';
import { parseHashtags } from '../utils/hashtagParser';

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

export function useNoteTags(metadataTags: string[], noteBody: string): {
  allTags: string[];
  inlineOnly: string[];
} {
  const inlineTags = useMemo(() => parseHashtags(noteBody).tags, [noteBody]);

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];

    for (const tag of metadataTags) {
      const normalized = normalizeTag(tag);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push(normalized);
    }

    for (const tag of inlineTags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      merged.push(tag);
    }

    return merged;
  }, [inlineTags, metadataTags]);

  const inlineOnly = useMemo(() => {
    const metadataSet = new Set(metadataTags.map(normalizeTag).filter(Boolean));
    return inlineTags.filter((tag) => !metadataSet.has(tag));
  }, [inlineTags, metadataTags]);

  return { allTags, inlineOnly };
}
