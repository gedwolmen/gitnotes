# Pro Paywall & Monetization

> GitNotēs Pro: 30-day free trial, $2.99/month subscription, $40 lifetime one-time purchase — powered by RevenueCat.

## Monetization model

| Plan | Price | Product type |
|------|-------|--------------|
| Free trial | 30 days | Store intro offer (App Store Connect introductory offer / Play Console free-trial base plan) |
| Monthly | $2.99/month (after trial) | Auto-renewable subscription |
| Yearly | $19.99/year (when configured) | Auto-renewable subscription |
| Lifetime | $40 one-time | Non-consumable in-app purchase |

Existing users (installed before the paywall release) are grandfathered as Pro forever and never see the paywall.

## Architecture

```
PaywallScreen ──► ProStore (zustand) ──► RevenueCatService ──► react-native-purchases
      ▲  ▲              │   ▲                          │
      │  │              │   └── customerInfo update listener (entitlement/trial changes)
      │  └──────────────┴── isPro = entitlementActive('pro') OR grandfathered
      └── gates call useProGate().openPaywall() when !isPro
```

### Files

- `src/services/RevenueCatService.ts` — the only module that imports `react-native-purchases`. Configures per platform (`EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` / `_ANDROID`; placeholder keys skip configuration), fetches offerings (packages `monthly` + `yearly` (optional) + `lifetime` from the current offering), purchases, restores, reads customer info, subscribes to updates, and computes iOS-only trial eligibility (`checkTrialOrIntroductoryPriceEligibility`; Android returns true — the Play sheet is the source of truth).
- `src/stores/proStore.ts` — zustand store: `status` (`loading | pro | free`), `entitlementActive`, `isGrandfathered`, `trialActive`/`trialEndsAt`, packages, purchase/restore actions, and the interstitial state machine. `selectIsPro(state) = entitlementActive || isGrandfathered`. Initialized at app boot in `App.tsx` (non-blocking, after `bootstrapStorage()`).
- `src/services/GrandfatherService.ts` — one-shot migration of existing users.

### Grandfathering semantics (read carefully)

Existing users are detected with **two mechanisms**, evaluated **once per install**:

1. **iOS**: `customerInfo.originalApplicationVersion < 9` (the CFBundleVersion of the first build the user downloaded; the paywall ships in build 9+). This is Apple's receipt-backed value — it survives reinstalls. The constant `PRO_PAYWALL_FIRST_BUILD = 9` must be the first build that contains the paywall.
2. **Cross-platform fallback**: if `@gitnotes:onboarding_completed` is already `'true'` at the first boot of the paywalled build, the user is grandfathered. (Every existing device has this flag.)

The decision is persisted once as `@gitnotes:pro_grandfathered` / `@gitnotes:grandfather_checked`. The flag **only ever adds Pro, never revokes it**. RevenueCat remains the source of truth for purchases.

Caveat: the Android fallback flag is device-local — a grandfathered user who uninstalls and reinstalls loses it (RevenueCat's own anonymous identity has the same limitation, since there are no app accounts).

### Gating map (Pro = AI suite + advanced features)

| Feature | Gate location |
|---------|---------------|
| AI chat / new chat | `aiHubStore.goNewChat` (src/stores/aiHubStore.ts) |
| Chat history | `aiHubStore.goChatHistory` |
| AI settings (hub menu) | `aiHubStore.goAISettings` |
| Thought dump / voice dump | `aiHubStore.goThoughtDump` / `goVoiceDump` + `ThoughtDumpScreen` guard |
| Chat screens (deep links) | `ChatThreadListScreen` / `ChatScreen` defensive `ProRequired` guards |
| Canvases | `CanvasListScreen` create + open handlers; `CanvasEditorScreen` guard |
| Custom templates | `TemplateManagerScreen` guard; `TemplateSelector` create-template CTA |
| Render styles | `RenderStyleSettingsScreen` + `RenderStyleEditorScreen` guards |
| Multiple GitHub accounts | `SettingsScreen` add-account handler (gated when ≥ 1 account exists) |
| Settings AI section | `SettingsContent` — locked row for free users |
| All gates | `useProGate()` hook + `ProRequired` component (src/components/paywall/ProRequired.tsx) |

**Free for everyone:** notes, todos, journals, single-account git sync, tags/folders/search/backlinks, themes, biometric lock, reminders.

### Interstitial

A one-time paywall presentation ~3 days after a trial expires: `@gitnotes:trial_was_active` → `@gitnotes:trial_expired_at` → `@gitnotes:interstitial_offer_shown`. Presented by `AppNavigator` when `interstitialEligible`. Never shown to grandfathered or paying users.

## RevenueCat configuration

- Entitlement: `pro` (both products grant it)
- Offering: `default` with packages `monthly` + `yearly` (optional) + `lifetime`
- Product identifiers (must match the stores exactly):
  - iOS: `com.xaventra.gitnotes.monthly`, `com.xaventra.gitnotes.yearly`, `com.xaventra.gitnotes.lifetime`
  - Android: `gitnotes_monthly`, `gitnotes_yearly`, `gitnotes_lifetime`

## Environment variables

```
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=appl_...
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=goog_...
```

These are RevenueCat **public SDK keys** (non-secret, embedded in the app). Copy `.env.example` to `.env` and fill them in. Placeholder values are treated as "not configured" — RevenueCat is skipped safely.

## Manual store setup checklist (user-performed)

> **Status:** iOS in progress. **Android deferred** — tracked in [issue #914](https://github.com/gedwolmen/gitnotes/issues/914) (needs the `goog_…` SDK key + Play Console products + Android sandbox QA). The code is cross-platform-ready; the paywall auto-hides packages the dashboard does not provide.

This cannot be automated — a human must complete it before real-device (sandbox) QA:

1. **RevenueCat dashboard**: create the project, add the iOS app (`com.xaventra.gitnotes`) and Android app (`org.gitnotes.app`), and copy the SDK keys into `.env`.
2. **App Store Connect keys** (Users and Access → Integrations): generate an **In-App Purchase** key (`SubscriptionKey_XXXX.p8`) for the RevenueCat in-app purchase key config (required for StoreKit 2 — transactions fail to record without it), and an **App Store Connect API** key (`AuthKey_XXXX.p8`) for product import/price sync. Fill Key ID + Issuer ID (UUID at top of the Integrations page) into the RevenueCat app settings.
3. **RevenueCat custom URL scheme**: RevenueCat assigns a per-app scheme (e.g. `rc-0aadf77f9f`). It is registered in `app.json` — iOS via `infoPlist.CFBundleURLTypes` (alongside the existing `gitnotes` scheme) and Android via `intentFilters`. Regenerate native folders with `npx expo prebuild --clean` after changing. Registering the scheme alone only opens the app — presenting the preview paywall needs `react-native-purchases-ui` + URL handling.
4. **App Store Connect**: create the auto-renewable subscriptions `com.xaventra.gitnotes.monthly` at $2.99 (with a **30-day free trial** introductory offer) and `com.xaventra.gitnotes.yearly` at $19.99, plus the non-consumable `com.xaventra.gitnotes.lifetime` at $40.
5. **Google Play Console**: create the subscriptions `gitnotes_monthly` at $2.99 (**free-trial base plan**, 30 days) and `gitnotes_yearly` at $19.99, plus the one-time product `gitnotes_lifetime` at $40.
6. **RevenueCat dashboard**: create the `pro` entitlement, link ALL products to it, create the `default` offering with `monthly` + `yearly` + `lifetime` packages (yearly is optional — the paywall hides it when absent), and mark it current.
7. Verify the build number: the paywall release must be **build ≥ 9** (iOS `buildNumber` in `app.json`) so `originalApplicationVersion < 9` correctly identifies pre-paywall users.
8. App Store review may require real terms/privacy URLs in the paywall's `paywall.termsNote` text — decide before submission.

## Testing notes

- `react-native-purchases` is globally mocked in `jest.setup.ts`; `proStore` is globally mocked **defaulting to PRO** so existing tests stay green — gating tests flip state via `__setProState` (import from `src/stores/proStore`). `proStore.test.ts` uses `jest.requireActual` to test the real store.
- New i18n keys must be added to all six locales (`en/es/fr/de/ja/ko`) or `__tests__/i18n-key-parity.test.ts` fails.
- Real purchases require a development build (`eas build --profile development`); Expo Go cannot purchase.
