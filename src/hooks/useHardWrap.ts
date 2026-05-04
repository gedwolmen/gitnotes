import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const HARD_WRAP_STORAGE_KEY = 'hardWrapEnabled';

export function applyHardWrap(text: string, enabled: boolean): string {
  if (!enabled || text.length === 0) return text;

  const segments: Array<{ text: string; code: boolean }> = [];
  let textLines: string[] = [];
  let codeLines: string[] = [];
  let inCodeBlock = false;
  let fenceToken: '```' | '~~~' | null = null;

  const flushText = () => {
    if (textLines.length === 0) return;
    segments.push({
      code: false,
      text: textLines.join('\n').replace(/([^\n])\n(?=[^\n])/g, '$1\n\n'),
    });
    textLines = [];
  };

  const flushCode = () => {
    if (codeLines.length === 0) return;
    segments.push({ code: true, text: codeLines.join('\n') });
    codeLines = [];
  };

  for (const line of text.split('\n')) {
    const fenceMatch = line.match(/^(\s*)(```|~~~)/);
    const currentFence = fenceMatch?.[2] as '```' | '~~~' | undefined;

    if (!inCodeBlock && currentFence) {
      flushText();
      inCodeBlock = true;
      fenceToken = currentFence;
      codeLines.push(line);
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);

      if (currentFence && currentFence === fenceToken) {
        flushCode();
        inCodeBlock = false;
        fenceToken = null;
      }

      continue;
    }

    textLines.push(line);
  }

  flushText();
  flushCode();

  return segments.map((segment) => segment.text).join('\n');
}

export function useHardWrap(): {
  hardWrapEnabled: boolean;
  toggleHardWrap: () => void;
} {
  const [hardWrapEnabled, setHardWrapEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(HARD_WRAP_STORAGE_KEY)
      .then((value) => {
        if (!active) return;
        if (value !== null) {
          setHardWrapEnabled(value === 'true');
        }
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(HARD_WRAP_STORAGE_KEY, hardWrapEnabled ? 'true' : 'false');
  }, [hardWrapEnabled, hydrated]);

  const toggleHardWrap = useCallback(() => {
    setHardWrapEnabled((value) => !value);
  }, []);

  return { hardWrapEnabled, toggleHardWrap };
}
