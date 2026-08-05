import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { Button } from '../src/components/ui/Button';
import { Card } from '../src/components/ui/Card';
import { Input } from '../src/components/ui/Input';
import {
  NativeWindThemeProvider,
  NATIVEWIND_TOKEN_VARIABLES,
  createNativeWindThemeVariables,
} from '../src/theme/nativewind';
import {
  NEUMORPHIC_DARK,
  NEUMORPHIC_LIGHT,
  RADII,
  SPACING,
  TYPE,
} from '../src/theme/tokens';
import { TestThemeProvider } from './ui/testThemeProvider';

jest.mock('nativewind', () => ({
  VariableContextProvider: ({ children }: { children?: ReactNode }) => children,
}));

function renderPreMigrationKit(mode: 'light' | 'dark') {
  return render(
    <TestThemeProvider mode={mode}>
      <NativeWindThemeProvider>
        <View>
          <Button label="Save" variant="primary" />
          <Card>
            <Text>Card body</Text>
          </Card>
          <Input value="Current tokens" editable={false} />
        </View>
      </NativeWindThemeProvider>
    </TestThemeProvider>,
  ).toJSON();
}

describe('NativeWind theme parity', () => {
  it('maps every ThemeContext token key', () => {
    expect(Object.keys(NATIVEWIND_TOKEN_VARIABLES.colors)).toEqual(
      Object.keys(NEUMORPHIC_LIGHT),
    );
    expect(Object.keys(NATIVEWIND_TOKEN_VARIABLES.radii)).toEqual(Object.keys(RADII));
    expect(Object.keys(NATIVEWIND_TOKEN_VARIABLES.spacing)).toEqual(Object.keys(SPACING));
    expect(Object.keys(NATIVEWIND_TOKEN_VARIABLES.type)).toEqual(Object.keys(TYPE));
  });

  it('resolves exact light and dark runtime variables', () => {
    expect(
      createNativeWindThemeVariables({
        colors: NEUMORPHIC_LIGHT,
        radii: RADII,
        spacing: SPACING,
        type: TYPE,
      }),
    ).toMatchSnapshot('runtime-variables-light');

    expect(
      createNativeWindThemeVariables({
        colors: NEUMORPHIC_DARK,
        radii: RADII,
        spacing: SPACING,
        type: TYPE,
      }),
    ).toMatchSnapshot('runtime-variables-dark');
  });

  it('matches the pre-migration key-kit snapshots in light and dark', () => {
    expect(renderPreMigrationKit('light')).toMatchSnapshot('pre-migration-light');
    expect(renderPreMigrationKit('dark')).toMatchSnapshot('pre-migration-dark');
  });
});
