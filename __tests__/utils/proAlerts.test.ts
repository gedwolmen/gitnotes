import { Alert } from 'react-native';
import { promptProUpgrade } from '../../src/utils/proAlerts';

// The jest react-i18next global mock resolves keys against src/i18n/en.json;
// this unit asserts on the raw keys, so use an identity t (the hook under test
// only cares about which keys are passed to Alert.alert).
const t = ((key: string) => key) as unknown as import('i18next').TFunction;

describe('promptProUpgrade', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('legacy 2-arg call (backward compat) — two buttons, upgrade onPress wired, cancel has NO onPress', () => {
    const openPaywall = jest.fn();
    promptProUpgrade(t, openPaywall);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('pro.lockedTitle');
    expect(body).toBe('pro.lockedBody');
    // Cancel button: style 'cancel', NO onPress when legacy (backward-compat)
    const cancelBtn = buttons.find((b: { text: string }) => b.text === 'common.cancel');
    expect(cancelBtn.style).toBe('cancel');
    expect(cancelBtn.onPress).toBeUndefined();
    // Upgrade button: onPress wired to openPaywall
    const upgradeBtn = buttons.find((b: { text: string }) => b.text === 'common.upgrade');
    upgradeBtn.onPress();
    expect(openPaywall).toHaveBeenCalledTimes(1);
  });

  it('new 3-arg call — cancel onPress wired to onCancel', () => {
    const openPaywall = jest.fn();
    const onCancel = jest.fn();
    promptProUpgrade(t, openPaywall, onCancel);
    const [, , buttons] = alertSpy.mock.calls[0];
    const cancelBtn = buttons.find((b: { text: string }) => b.text === 'common.cancel');
    expect(typeof cancelBtn.onPress).toBe('function');
    cancelBtn.onPress();
    expect(onCancel).toHaveBeenCalledTimes(1);
    // upgrade button unaffected
    const upgradeBtn = buttons.find((b: { text: string }) => b.text === 'common.upgrade');
    upgradeBtn.onPress();
    expect(openPaywall).toHaveBeenCalledTimes(1);
  });
});
