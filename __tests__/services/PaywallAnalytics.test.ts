import {
  trackCtaTap,
  trackPaywallClose,
  trackPaywallOpen,
  trackPurchaseAttempt,
  trackPurchaseOutcome,
  trackRestoreOutcome,
  trackRestoreTap,
} from '../../src/services/PaywallAnalytics';

describe('PaywallAnalytics', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const lastWarn = (): { channel: string; payload: Record<string, unknown> } => {
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const call = warnSpy.mock.calls[warnSpy.mock.calls.length - 1];
    return { channel: call[0] as string, payload: JSON.parse(call[1] as string) };
  };

  it('trackPaywallOpen emits paywall_open via console.warn on the [paywall] channel', () => {
    trackPaywallOpen();
    const { channel, payload } = lastWarn();
    expect(channel).toBe('[paywall]');
    expect(payload).toMatchObject({ event: 'paywall_open' });
    expect(payload.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Object.keys(payload)).toEqual(['event', 'ts']);
  });

  it('trackPaywallClose emits paywall_close with dwellMs and converted', () => {
    trackPaywallClose(4200, true);
    expect(lastWarn().payload).toMatchObject({
      event: 'paywall_close',
      dwellMs: 4200,
      converted: true,
    });
  });

  it('trackCtaTap emits cta_tap with packageId', () => {
    trackCtaTap('gitnotes_pro_monthly');
    expect(lastWarn().payload).toMatchObject({
      event: 'cta_tap',
      packageId: 'gitnotes_pro_monthly',
    });
  });

  it('trackPurchaseAttempt emits purchase_attempt with packageId', () => {
    trackPurchaseAttempt('gitnotes_pro_annual');
    expect(lastWarn().payload).toMatchObject({
      event: 'purchase_attempt',
      packageId: 'gitnotes_pro_annual',
    });
  });

  it('trackPurchaseOutcome emits purchase_outcome with kind', () => {
    trackPurchaseOutcome('cancelled');
    expect(lastWarn().payload).toMatchObject({ event: 'purchase_outcome', kind: 'cancelled' });
  });

  it('trackRestoreTap emits restore_tap', () => {
    trackRestoreTap();
    expect(Object.keys(lastWarn().payload)).toEqual(['event', 'ts']);
    expect(lastWarn().payload).toMatchObject({ event: 'restore_tap' });
  });

  it('trackRestoreOutcome emits restore_outcome with outcome', () => {
    trackRestoreOutcome('nothing');
    expect(lastWarn().payload).toMatchObject({ event: 'restore_outcome', outcome: 'nothing' });
  });
});
