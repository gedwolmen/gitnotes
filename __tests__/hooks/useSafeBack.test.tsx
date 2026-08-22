const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  canGoBack: mockCanGoBack,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));

import { act, renderHook } from '@testing-library/react-native';
import { useSafeBack } from '../../src/hooks/useSafeBack';

describe('useSafeBack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('pops via goBack when there is a previous screen', () => {
    const { result } = renderHook(() => useSafeBack());

    act(() => result.current());

    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('falls back to MainTabs when the screen is the stack root (deep link)', () => {
    mockCanGoBack.mockReturnValue(false);
    const { result } = renderHook(() => useSafeBack());

    act(() => result.current());

    expect(mockNavigate).toHaveBeenCalledWith('MainTabs');
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});
