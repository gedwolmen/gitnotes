import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HostPicker, type HostPickerValue } from '../../src/components/HostPicker';
import { TestThemeProvider } from './testThemeProvider';

describe('HostPicker', () => {
  const defaultValue: HostPickerValue = { hostKind: 'github', baseUrl: undefined };

  it('renders the three host-kind buttons by default', () => {
    const { getByTestId } = render(
      <TestThemeProvider>
        <HostPicker value={defaultValue} onChange={jest.fn()} testID="host" />
      </TestThemeProvider>,
    );
    expect(getByTestId('host.kind.github')).toBeTruthy();
    expect(getByTestId('host.kind.gitea')).toBeTruthy();
    expect(getByTestId('host.kind.gitlab')).toBeTruthy();
  });

  it('hides the GitHub button when showGitHub is false', () => {
    const { queryByTestId, getByTestId } = render(
      <TestThemeProvider>
        <HostPicker
          value={defaultValue}
          onChange={jest.fn()}
          showGitHub={false}
          testID="host"
        />
      </TestThemeProvider>,
    );
    expect(queryByTestId('host.kind.github')).toBeNull();
    expect(getByTestId('host.kind.gitea')).toBeTruthy();
    expect(getByTestId('host.kind.gitlab')).toBeTruthy();
  });

  it('does not render the baseUrl input for github (no baseUrl required)', () => {
    const { queryByTestId } = render(
      <TestThemeProvider>
        <HostPicker value={defaultValue} onChange={jest.fn()} testID="host" />
      </TestThemeProvider>,
    );
    expect(queryByTestId('host.baseUrl')).toBeNull();
  });

  it('renders the baseUrl input + hint for gitea', () => {
    const { getByTestId, queryByTestId } = render(
      <TestThemeProvider>
        <HostPicker
          value={{ hostKind: 'gitea', baseUrl: undefined }}
          onChange={jest.fn()}
          testID="host"
        />
      </TestThemeProvider>,
    );
    expect(getByTestId('host.baseUrl')).toBeTruthy();
    // Hint only shows when baseUrl is empty.
    expect(getByTestId('host.baseUrl.hint')).toBeTruthy();
    expect(queryByTestId('host.baseUrl.surface')).toBeTruthy();
  });

  it('renders the baseUrl input for gitlab but does not show the hint when populated', () => {
    const { getByTestId, queryByTestId } = render(
      <TestThemeProvider>
        <HostPicker
          value={{ hostKind: 'gitlab', baseUrl: 'https://gitlab.example.com' }}
          onChange={jest.fn()}
          testID="host"
        />
      </TestThemeProvider>,
    );
    expect(getByTestId('host.baseUrl')).toBeTruthy();
    expect(queryByTestId('host.baseUrl.hint')).toBeNull();
  });

  it('fires onChange with the new hostKind when a kind button is pressed', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <TestThemeProvider>
        <HostPicker value={defaultValue} onChange={onChange} testID="host" />
      </TestThemeProvider>,
    );
    fireEvent.press(getByTestId('host.kind.gitlab'));
    // baseUrl is preserved (was undefined) so the user can re-enter it
    // for the new host without losing what they typed.
    expect(onChange).toHaveBeenCalledWith({
      hostKind: 'gitlab',
      baseUrl: undefined,
    });
  });

  it('preserves the baseUrl when switching from gitea to gitlab on the same instance', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <TestThemeProvider>
        <HostPicker
          value={{ hostKind: 'gitea', baseUrl: 'https://self-hosted.example.com' }}
          onChange={onChange}
          testID="host"
        />
      </TestThemeProvider>,
    );
    fireEvent.press(getByTestId('host.kind.gitlab'));
    expect(onChange).toHaveBeenCalledWith({
      hostKind: 'gitlab',
      baseUrl: 'https://self-hosted.example.com',
    });
  });

  it('drops the baseUrl when switching from a self-hosted host to github', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <TestThemeProvider>
        <HostPicker
          value={{ hostKind: 'gitea', baseUrl: 'https://gitea.example.com' }}
          onChange={onChange}
          testID="host"
        />
      </TestThemeProvider>,
    );
    fireEvent.press(getByTestId('host.kind.github'));
    // GitHub.com doesn't need a baseUrl — drop the field.
    expect(onChange).toHaveBeenCalledWith({
      hostKind: 'github',
      baseUrl: undefined,
    });
  });

  it('fires onChange with the trimmed baseUrl when the input changes', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <TestThemeProvider>
        <HostPicker
          value={{ hostKind: 'gitea', baseUrl: '' }}
          onChange={onChange}
          testID="host"
        />
      </TestThemeProvider>,
    );
    fireEvent.changeText(getByTestId('host.baseUrl'), '  https://gitea.example.com/  ');
    expect(onChange).toHaveBeenCalledWith({
      hostKind: 'gitea',
      baseUrl: 'https://gitea.example.com/',
    });
  });

  it('treats an all-whitespace baseUrl as empty', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <TestThemeProvider>
        <HostPicker
          value={{ hostKind: 'gitea', baseUrl: 'https://gitea.example.com' }}
          onChange={onChange}
          testID="host"
        />
      </TestThemeProvider>,
    );
    fireEvent.changeText(getByTestId('host.baseUrl'), '   ');
    expect(onChange).toHaveBeenCalledWith({
      hostKind: 'gitea',
      baseUrl: undefined,
    });
  });
});
