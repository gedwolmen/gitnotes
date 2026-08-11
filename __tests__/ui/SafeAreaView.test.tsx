import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { useCssElement } from 'react-native-css';
import { SafeAreaView as NativeSafeAreaView } from 'react-native-safe-area-context';
import { SafeAreaView } from '../../src/components/ui/SafeAreaView';

jest.mock('react-native-css', () => {
  const React = require('react');

  return {
    styled: <Component,>(component: Component): Component => component,
    useCssElement: jest.fn(
      (component: React.ElementType, props: Record<string, unknown>) =>
        React.createElement(component, props),
    ),
  };
});

describe('SafeAreaView', () => {
  it('maps className to style while preserving native props and children', () => {
    const style = { backgroundColor: 'tomato' } as const;
    const child = <Text>Safe content</Text>;

    render(
      <SafeAreaView
        className="flex-1"
        edges={['top', 'bottom']}
        style={style}
        testID="safe-area"
      >
        {child}
      </SafeAreaView>,
    );

    expect(useCssElement).toHaveBeenCalledTimes(1);
    expect(useCssElement).toHaveBeenCalledWith(
      NativeSafeAreaView,
      expect.objectContaining({
        children: child,
        className: 'flex-1',
        edges: ['top', 'bottom'],
        style,
        testID: 'safe-area',
      }),
      { className: 'style' },
    );
  });
});
