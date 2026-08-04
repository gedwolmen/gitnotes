import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Button } from '../src/screens/__dev__/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../src/screens/__dev__/ui/card';
import { Input } from '../src/screens/__dev__/ui/input';

describe('UI Stack Smoke Test (NativeWind v5 + React Native Reusables)', () => {
  it('renders Button with NativeWind className', () => {
    const { getByTestId } = render(
      <Button testID="test-button" variant="default" />
    );
    expect(getByTestId('test-button')).toBeTruthy();
  });

  it('renders Button variants', () => {
    const { getByTestId } = render(
      <>
        <Button testID="btn-default" />
        <Button testID="btn-outline" variant="outline" />
        <Button testID="btn-ghost" variant="ghost" />
      </>
    );
    expect(getByTestId('btn-default')).toBeTruthy();
    expect(getByTestId('btn-outline')).toBeTruthy();
    expect(getByTestId('btn-ghost')).toBeTruthy();
  });

  it('renders Card with header, title and content', () => {
    const { getByTestId, getByText } = render(
      <Card testID="test-card">
        <CardHeader>
          <CardTitle>Test Card</CardTitle>
        </CardHeader>
        <CardContent>
          <Text>Card body text</Text>
        </CardContent>
      </Card>
    );
    expect(getByTestId('test-card')).toBeTruthy();
    expect(getByText('Test Card')).toBeTruthy();
    expect(getByText('Card body text')).toBeTruthy();
  });

  it('renders Input with placeholder and value', () => {
    const { getByTestId } = render(
      <Input
        testID="test-input"
        placeholder="Enter text"
        value="hello"
        onChangeText={() => {}}
      />
    );
    const input = getByTestId('test-input');
    expect(input).toBeTruthy();
    expect(input.props.placeholder).toBe('Enter text');
    expect(input.props.value).toBe('hello');
  });

  it('renders Button + Card + Input together (full smoke)', () => {
    const { getByTestId } = render(
      <Card testID="smoke-card">
        <CardHeader>
          <CardTitle>Smoke Test</CardTitle>
        </CardHeader>
        <CardContent>
          <Input testID="smoke-input" placeholder="Type here" />
          <Button testID="smoke-button" />
        </CardContent>
      </Card>
    );
    expect(getByTestId('smoke-card')).toBeTruthy();
    expect(getByTestId('smoke-input')).toBeTruthy();
    expect(getByTestId('smoke-button')).toBeTruthy();
  });
});
