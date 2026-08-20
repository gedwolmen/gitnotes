const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  canGoBack: mockCanGoBack,
};
const mockT = jest.fn((key: string) => key);

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => mockNavigation,
    useFocusEffect: (cb: () => void) => React.useEffect(cb),
  };
});

// Identity t (stable identity) so alert assertions use raw i18n keys and the
// useFocusEffect deps stay stable across re-renders.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}));

import { Alert } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { useProScreenGuard } from '../../src/hooks/useProScreenGuard';
import { __setProState } from '../../src/stores/proStore';

function setFree(): void {
  __setProState({ status: 'free', entitlementActive: false, isGrandfathered: false });
}
function setLoading(): void {
  __setProState({ status: 'loading', entitlementActive: false, isGrandfathered: false });
}
function setPro(): void {
  __setProState({ status: 'pro', entitlementActive: true, isGrandfathered: false });
}

describe('useProScreenGuard', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockCanGoBack.mockReturnValue(true);
    // jest.setup.ts defaults the global proStore mock to PRO; be explicit.
    setPro();
  });

  it('pro user → blocked=false, no alert fired', () => {
    const { result } = renderHook(() => useProScreenGuard());
    expect(result.current).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('loading user → blocked=true, NO alert fired (cold-launch protection)', () => {
    setLoading();
    const { result } = renderHook(() => useProScreenGuard());
    expect(result.current).toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('settled free → blocked=true, alert fired once with lockedTitle/lockedBody', () => {
    setFree();
    const { result } = renderHook(() => useProScreenGuard());
    expect(result.current).toBe(true);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('pro.lockedTitle');
    expect(body).toBe('pro.lockedBody');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text).toBe('common.cancel');
    expect(buttons[1].text).toBe('common.upgrade');
  });

  it('free, canGoBack=true → cancel onPress navigates via goBack, not MainTabs', () => {
    setFree();
    renderHook(() => useProScreenGuard());
    const [cancelBtn] = alertSpy.mock.calls[0][2];
    cancelBtn.onPress();
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalledWith('MainTabs');
  });

  it('free, canGoBack=false → cancel onPress navigates to MainTabs (deep-link cold-start fallback)', () => {
    mockCanGoBack.mockReturnValue(false);
    setFree();
    renderHook(() => useProScreenGuard());
    const [cancelBtn] = alertSpy.mock.calls[0][2];
    cancelBtn.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('MainTabs');
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('free, upgrade onPress → openPaywall → navigates to Paywall', () => {
    setFree();
    renderHook(() => useProScreenGuard());
    const [, upgradeBtn] = alertSpy.mock.calls[0][2];
    upgradeBtn.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('Paywall');
  });

  it('onBlockedLeave invoked BEFORE the goBack leave path (cancel)', () => {
    setFree();
    const calls: string[] = [];
    mockGoBack.mockImplementation(() => {
      calls.push('goBack');
    });
    const onBlockedLeave = jest.fn(() => {
      calls.push('onBlockedLeave');
    });
    renderHook(() => useProScreenGuard(onBlockedLeave));
    const [cancelBtn] = alertSpy.mock.calls[0][2];
    cancelBtn.onPress();
    expect(onBlockedLeave).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['onBlockedLeave', 'goBack']);
  });

  it('onBlockedLeave invoked BEFORE the Paywall leave path (upgrade)', () => {
    setFree();
    const calls: string[] = [];
    mockNavigate.mockImplementation(() => {
      calls.push('navigate');
    });
    const onBlockedLeave = jest.fn(() => {
      calls.push('onBlockedLeave');
    });
    renderHook(() => useProScreenGuard(onBlockedLeave));
    const [, upgradeBtn] = alertSpy.mock.calls[0][2];
    upgradeBtn.onPress();
    expect(onBlockedLeave).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['onBlockedLeave', 'navigate']);
    expect(mockNavigate).toHaveBeenCalledWith('Paywall');
  });

  it('settledFree dep → entitlement flip pro→free re-fires alert without blur/refocus', () => {
    setFree();
    const { rerender } = renderHook(() => useProScreenGuard());
    expect(alertSpy).toHaveBeenCalledTimes(1);
    setPro();
    rerender();
    expect(alertSpy).toHaveBeenCalledTimes(1); // pro again → no new alert
    setFree();
    rerender();
    expect(alertSpy).toHaveBeenCalledTimes(2); // live revocation re-fires
  });
});
