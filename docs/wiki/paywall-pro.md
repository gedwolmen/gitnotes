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

- `src/services/RevenueCatService.ts` — the only module that **imports `react-native-purchases` at runtime** (ProStore uses a type-only import to satisfy the TypeScript compiler; no dependency link at execution). Configures per platform (`EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` / `_ANDROID`; placeholder keys skip configuration), fetches offerings (packages `monthly` + `yearly` (optional) + `lifetime` from the current offering), purchases, restores, reads customer info, subscribes to updates, derives entitlement / trial state from `customerInfo`, and resolves intro-eligibility via `getIntroEligibilities` (RC v10+ API returning `IntroEligibilityStatus` per iOS product; Android returns `UNKNOWN` — standard pricing is shown and the Play sheet is the source of truth).
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
| Settings AI section | `SettingsContent` — free users see ALL AI rows (feature + deep-config: Enable AI, Daily Quote, AI Personalization, GitHub Tools, model selector, action mode, chat storage, providers, reset AI memory) LOCKED — lock icon instead of toggle, tap → paywall; pro+AI users get functional rows |
| Biometric lock | `SettingsContent` Security row — lock icon for free, tap → paywall |
| Second GitHub account | `SettingsContent` "Connect host" add-row — lock icon when free user has 1 account, tap → paywall (first account free) |
| Second repository | `SettingsContent` "Add Repository" row — lock icon when free user has 1 repo, tap → paywall (first repo free) |
| Graph view | `NotesViewModePicker` / `NotesListScreen` — lock icon on graph option for free, tap → paywall |
| Fancy UI style | `SettingsContent` `settings.row.updated-ui` — lock icon instead of toggle for free, tap → paywall; fresh installs default to `flat` |
| AI button (FloatingAIButton) | `FloatingAIButton` returns `null` when `useProGate().isPro` is false (hidden for free users); `aiHubStore` still routes any free tap to Paywall as a backstop |
| All gates | `useProGate()` hook + `ProRequired` component (src/components/paywall/ProRequired.tsx) |

**Free for everyone:** notes, todos, journals, single-account git sync, tags/folders/search/backlinks, themes, reminders, one GitHub account, one repository. **Pro only:** biometric lock and the AI suite.

### Show-locked pattern

Pro features are no longer HIDDEN from free users — they are SHOWN with a `lock-closed` icon in place of the control (toggle, row action, picker option) and tapping the row opens the paywall (`promptProUpgrade` / `useProGate().openPaywall()` / `aiHubStore` → `Paywall`). Rows render identically for both tiers except the trailing control and `onPress`, which branch per-row on `isPro` (see `SettingsContent.tsx` rows `settings.row.ai-locked-*`, `settings.row.biometric-lock-locked`, `settings.row.connect-host-locked`, `settings.row.add-repo-locked`, and the graph option in `NotesViewModePicker.tsx`). **Exception:** the floating AI button is a draggable overlay with no lockable row control, so it is hidden entirely for free users (`FloatingAIButton` guards on `useProGate().isPro`).

### Interstitial

A one-time paywall presentation ~3 days after a trial expires: `@gitnotes:trial_was_active` → `@gitnotes:trial_expired_at` → `@gitnotes:interstitial_offer_shown`. Presented by `AppNavigator` when `interstitialEligible`. Never shown to grandfathered or paying users.

### Paywall UI: tab bar & bottom safe-area

The paywall is a root-stack screen pushed above `MainTabs`, so the tab bar and the bottom home-indicator inset must be handled explicitly:

- **Tab bar**: `TabNavigator` reads the root stack's focused route (`useNavigationState`) and renders `() => null` for the `tabBar` while `Paywall` is on top. This is the single guard that covers all three tab bar variants — the custom neumorphic `TabBar` (whose `parentRouteName === 'Paywall'` check only fires for that variant), the default React Navigation bar (flat style / tablets), and the `TabletRail`. Without it, the default bar renders under the paywall in flat theme, showing as a dark/light strip at the bottom.
- **Bottom inset**: `PaywallScreen` uses `SafeAreaView edges={['top']}` (not the default all-edges) so the `ScrollView` viewport extends to the physical screen edge, and sets `paddingBottom: insets.bottom + 40` so content still clears the home indicator when scrolled to the end. The default all-edges behavior left a ~34pt dead strip at the bottom that content could never scroll into.

## StoreKit compatibility

- **StoreKit 2 active.** Migration from StoreKit 1 (`react-native-purchases` v1.x) completed with commit 54f07883 switching the SDK target to v10.x. App Store Connect ASC In-App Purchase key configured and linked in RevenueCat; sandbox transactions record correctly. StoreKit 2 handles all purchase / restore / entitlement APIs used by this paywall.

## Impressions & analytics

### Track custom paywall impression

`trackCustomPaywallImpression` fires once per presentation of the leaf-level paywall screen (the one the user sees). If the same screen is remounted — e.g. due to navigation pop + push or state reset — a new impression fires. This semantics guarantees exactly-one-per-visible-session even if React unmounting/remounting cycle occurs within the same visual presentation.

### Analytics event catalog

All events emit via `console.warn` through `PaywallAnalytics`. Babel transform strips `console.log` / `console.info` calls in production builds; `console.warn` survives to ensure observability without polluting device logs with no-op traces. Decision to use `warn` over an alternative backend logging SDK: zero external dependency — pure console output.

| Event | Parameters | When |
|-------|-----------|------|
| `paywall_open` | `{source}` | Paywall presented |
| `paywall_close` | `{dwellMs, converted}` | User dismisses; `dwellMs` = elapsed time on screen; `converted` = true if purchase triggered in session |
| `cta_tap` | `{packageId, type}` | CTA button tapped (`monthly` / `yearly` / `lifetime`); `type` = `"trial"` / `"purchase"` |
| `purchase_attempt` | `{packageId, platform}` | Purchase initiated |
| `purchase_outcome` | `{success, error?}` | Purchase complete or failed |
| `restore_tap` | `{}` | Restore purchases tapped |
| `restore_outcome` | `{status, previousEntitlements?, restoredPackages?}` | Derived from `customerInfo` comparison after restore completes |

Each event carries deterministic payload shapes. Tests spy exclusively on `console.warn`; swapping to any other log level causes assertion failures.

## Restore UX

The restore flow has four observable states:

1. **Restoring** — spinner shown, `Restoring` label ("Restoring purchases…")
2. **Restored** — green confirmation banner listing purchased packages found in the restored `customerInfo` (compared against local state)
3. **Nothing to restore** — neutral message ("No previous purchases detected") when the restored `customerInfo` contains no paid products beyond what the current session already holds
4. **Error** — red error banner with retry CTA; message surfaces the underlying RC error reason if available

Restore outcome is entirely derived from `customerInfo`: entitlement list, transaction history, and product identifiers. No manual state mutation.

## Intro-eligibility policy

**iOS:** Per-product intro eligibility resolved via `getIntroEligibilities([monthlyProductId, yearlyProductId])`. Each product returns `IntroEligibilityStatus` (eligible / ineligible / unknown). Intro offers apply independently per subscription tier — a user who cancels monthly and resubscribes may remain eligible for the monthly trial if Apple's terms allow, but yearly is always evaluated separately.

**Android:** RC returns `UNKNOWN` for Android intro eligibility because Google Play Billing determines actual intro pricing from the Play sheet, not from client-side eligibility checks. Standard (non-discounted) pricing is shown; the Play billing sheet is authoritative for trial/offers. This decision follows RevenueCat guidance (#935 acceptance point 6).

## Legal links

Both Terms of Service and Privacy Policy URLs must appear in the paywall footer. Links point to:

- Terms: `https://gitnotes.org/terms`
- Privacy: `https://gitnotes.org/privacy`

These serve as the referenced terms required by Apple App Store review guidelines for subscription purchases with free trials. See checklist item 8 below.

## Bento layout (#921)

The Pro upgrade page uses a bento-grid tile layout rather than full-width cards:

- **Grid spec:** responsive two-column grid on screens ≥ 640pt width, single column below. Configurable via breakpoint constant `BENTO_BREAKPOINT_640PT`.
- **Hero card:** the primary subscription card spans the full grid width on tablet breakpoints, centered visually with elevated shadow and accent-colored CTA.
- **Tile structure:** each feature row renders as its own grid cell with rounded corners, padding gap 12pt, subtle background tint matching theme palette.
- **i18n:** all tile labels live in translation keys under `paywall.bento.*` namespace (English, Spanish, French, German, Japanese, Korean). Grid column count itself is not translated — device width drives the layout.

---

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

**Native setup:** `react-native-purchases@10.7.1` ships **no Expo config plugin** (`app.plugin.js` absent) — do NOT add it to `app.json` plugins (breaks `expo prebuild`). The native module links automatically via Expo autolinking (podspec + gradle). For **production**, the App ID must have the **In-App Purchase capability** (enable it in the Apple Developer portal / App Store Connect and ensure the EAS provisioning profile includes it); StoreKit sandbox on the simulator needs no capability.

## Manual store setup checklist (user-performed)

> **Status:** iOS in progress. **Android deferred** — tracked in [issue #914](https://github.com/gedwolmen/gitnotes/issues/914) (needs the `goog_…` SDK key + Play Console products + Android sandbox QA). The code is cross-platform-ready; the paywall auto-hides packages the dashboard does not provide.

This cannot be automated — a human must complete it before real-device (sandbox) QA:

1. **RevenueCat dashboard**: create the project, add the iOS app (`com.xaventra.gitnotes`) and Android app (`org.gitnotes.app`), and copy the SDK keys into `.env`.
2. **App Store Connect keys** (Users and Access → Integrations): generate an **In-App Purchase** key (`SubscriptionKey_XXXX.p8`) for the RevenueCat in-app purchase key config, and an **App Store Connect API** key (`AuthKey_XXXX.p8`) for product import/price sync. Fill Key ID + Issuer ID (UUID at top of the Integrations page) into the RevenueCat app settings.
3. **RevenueCat custom URL scheme**: RevenueCat assigns a per-app scheme (e.g. `rc-0aadf77f9f`). It is registered in `app.json` — iOS via `infoPlist.CFBundleURLTypes` (alongside the existing `gitnotes` scheme) and Android via `intentFilters`. Regenerate native folders with `npx expo prebuild --clean` after changing. Registering the scheme alone only opens the app — presenting the preview paywall needs `react-native-purchases-ui` + URL handling.
4. **App Store Connect**: create the auto-renewable subscriptions `com.xaventra.gitnotes.monthly` at $2.99 (with a **30-day free trial** introductory offer) and `com.xaventra.gitnotes.yearly` at $19.99, plus the non-consumable `com.xaventra.gitnotes.lifetime` at $40.
5. **Google Play Console**: create the subscriptions `gitnotes_monthly` at $2.99 (**free-trial base plan**, 30 days) and `gitnotes_yearly` at $19.99, plus the one-time product `gitnotes_lifetime` at $40.
6. **RevenueCat dashboard**: create the `pro` entitlement, link ALL products to it, create the `default` offering with `monthly` + `yearly` + `lifetime` packages (yearly is optional — the paywall hides it when absent), and mark it current.
7. Verify the build number: the paywall release must be **build ≥ 9** (iOS `buildNumber` in `app.json`) so `originalApplicationVersion < 9` correctly identifies pre-paywall users.
8. **Legal links (RESOLVED):** Terms of Service (`https://gitnotes.org/terms`) and Privacy Policy (`https://gitnotes.org/privacy`) are present in the paywall footer. App Store review requirement satisfied.

## Testing notes

- `react-native-purchases` is globally mocked in `jest.setup.ts`; `proStore` is globally mocked **defaulting to PRO** so existing tests stay green — gating tests flip state via `__setProState` (import from `src/stores/proStore`). `proStore.test.ts` uses `jest.requireActual` to test the real store.
- New i18n keys must be added to all six locales (`en/es/fr/de/ja/ko`) or `__tests__/i18n-key-parity.test.ts` fails.
- Real purchases require a development build (`eas build --profile development`); Expo Go cannot purchase.
- `PaywallAnalytics` module tests (7 cases) verify deterministic event emission via `console.warn` spy; swapping to any other log level breaks assertions. `PaywallFeatureGrid` component tests (Bento grid tile layout, responsive column breakpoints) cover the bento visual spec for #921.
