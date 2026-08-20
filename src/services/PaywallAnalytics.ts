type Payload = Record<string, unknown>;

const CHANNEL = '[paywall]' as const;

function emit(event: string, payload?: Payload): void {
  try {
    console.warn(CHANNEL, JSON.stringify({ event, ts: new Date().toISOString(), ...payload }));
  } catch {
    // never throw into callers: analytics must not break the paywall flow
  }
}

export const trackPaywallOpen = (): void => emit('paywall_open');

export const trackPaywallClose = (dwellMs: number, converted: boolean): void =>
  emit('paywall_close', { dwellMs, converted });

export const trackCtaTap = (packageId: string): void => emit('cta_tap', { packageId });

export const trackPurchaseAttempt = (packageId: string): void =>
  emit('purchase_attempt', { packageId });

export const trackPurchaseOutcome = (kind: 'purchased' | 'cancelled' | 'error'): void =>
  emit('purchase_outcome', { kind });

export const trackRestoreTap = (): void => emit('restore_tap');

export const trackRestoreOutcome = (outcome: 'restored' | 'nothing' | 'error'): void =>
  emit('restore_outcome', { outcome });
