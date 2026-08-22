# Pro Dev Override — iOS Simulator QA Mode

## What It Is

A `__DEV__`-only override that forces the Pro gate open in iOS simulator builds, allowing QA to test paid features without going through IAP.

**This is a dev-only override, NOT a payment bypass.** RevenueCat still runs unchanged (`initialize` / `refresh` / `purchaseMonthly` / `purchaseYearly` / `purchaseLifetime` / `restore` all execute normally). Only the derived gate (`selectIsPro` + `status`) is forced to `true` / `'pro'` in the simulator.

## Gate Triple

```ts
export const DEV_FORCE_PRO = __DEV__ && Platform.OS === 'ios' && isSimulator();
```

All three conditions must be true:

| Condition | Purpose |
|---|---|
| `__DEV__` | Compiled out in production builds — never active in App Store / TestFlight |
| `Platform.OS === 'ios'` | Android and web are completely unaffected |
| `!Device.isDevice` | Only `true` in the iOS simulator; real iOS devices are unaffected |

## Why the Store Is the Single Patch Point

`proStore.ts` (`src/stores/proStore.ts`) is the only file changed. All Pro gates funnel through it:

- **`selectIsPro`** — used by `useProGate()` to derive `isPro`
- **`status`** — used by `useProScreenGuard.ts:31` (`blocked = status === 'loading' || !isPro`) and directly by `PaywallScreen.tsx:67,106,115,124` (`status === 'pro'`)

Patching both ensures the override covers both the `isPro` selector path and the direct `status` checks.

## Four Status Assignment Sites

All four store state transitions that set `status` are patched:

1. **Customer-info update listener** (`proStore.ts:152`) — fires when RevenueCat emits a new entitlement
2. **initialize success** (`proStore.ts:162`) — first resolution of entitlement state
3. **initialize catch** (`proStore.ts:166`) — network or config error; override ensures QA never gets a broken paywall on init failure in the sim
4. **refresh** (`proStore.ts:176`) — periodic re-check; override survives refresh too

## RevenueCat Integration — Unchanged

```ts
// These all run exactly as before — the override only affects the derived gate:
await configureRevenueCat();   // unchanged
await getCustomerInfo();       // unchanged — result is fetched but overridden
await purchaseMonthly();       // unchanged — still records a real purchase attempt
await restorePurchases();      // unchanged
```

## Test Coverage

`__tests__/stores/proStore.test.ts` covers two cases:

- **Case A** (`isDevice: false`, iOS): `selectIsPro` returns `true` even when `entitlementActive: false, isGrandfathered: false`; `status` becomes `'pro'` after `initialize()` regardless of RevenueCat result (including the catch path).
- **Case B** (`isDevice: true`): `DEV_FORCE_PRO === false`; existing behavior preserved — status falls back to `'free'` when no entitlement.

## Source

- Store: [`src/stores/proStore.ts`](https://github.com/gedwolmen/gitnotes/blob/main/src/stores/proStore.ts)
- Test: [`__tests__/stores/proStore.test.ts`](https://github.com/gedwolmen/gitnotes/blob/main/__tests__/stores/proStore.test.ts)
