import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext';
import { bootstrapStorage, clearBootCache } from '../src/services/StorageBootstrap';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Project's jest setup mocks AsyncStorage with getItem/setItem/removeItem only.
// bootstrapStorage uses multiGet — supply it here so the lazy-init path can run.
beforeAll(() => {
  if (typeof (AsyncStorage as unknown as { multiGet?: unknown }).multiGet !== 'function') {
    (AsyncStorage as unknown as { multiGet: (keys: string[]) => Promise<[string, string | null][]> }).multiGet =
      async (keys: string[]) => {
        const out: [string, string | null][] = [];
        for (const k of keys) {
          out.push([k, await AsyncStorage.getItem(k)]);
        }
        return out;
      };
  }
});

function ThemeProbe() {
  const { theme, isDark, style } = useTheme();
  return <Text testID="probe">{`theme=${theme} dark=${isDark ? '1' : '0'} style=${style}`}</Text>;
}

beforeEach(async () => {
  clearBootCache();
  await AsyncStorage.clear?.();
});

describe('ThemeProvider initial paint', () => {
  it('uses bootstrap cache values on first render so the first frame matches the persisted theme', async () => {
    await AsyncStorage.setItem('@gitnotes:theme', 'dark');
    await AsyncStorage.setItem('@gitnotes:style', 'flat');
    await bootstrapStorage();

    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    // First synchronous render must reflect the saved theme/style — no
    // need to flush effects. This is what prevents the light-mode flash.
    expect(getByTestId('probe').props.children).toBe('theme=dark dark=1 style=flat');
  });

  it('falls back to system theme when no persisted value is in the boot cache', async () => {
    await bootstrapStorage();

    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(getByTestId('probe').props.children).toMatch(/theme=system/);
  });
});
