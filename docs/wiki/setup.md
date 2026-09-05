# Setup

> Prerequisites, clone, install, and run.

## Prerequisites

- **Node.js** 20.18+ (`node --version`)
- **Yarn** 1.22 (`yarn --version`)
- **Xcode** 15+ (iOS)
- **Android Studio** (Android)
- **Git** 2.30+

## Clone

```bash
git clone https://github.com/gedwolmen/gitnotes.git
cd gitnotes
yarn install
```

## Run

```bash
yarn start        # Metro bundler
yarn ios          # iOS
yarn android      # Android
yarn web          # Web
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values as needed:

```bash
cp .env.example .env
```

Key variables:
- `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` / `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` — RevenueCat SDK keys (required for Pro paywall)
- `GITHUB_TEST_TOKEN` — PAT for E2E test suite (optional)
- `FORCE_ENABLE_PRO_ON_SIMULATOR=false` — show paywalls even on iOS simulator in dev

## Troubleshooting

**Metro bundler issues:**
```bash
yarn start --clear
watchman watch-del-all
rm -rf node_modules && yarn install
```

**iOS build issues:**
```bash
cd ios && rm -rf Pods/ Podfile.lock && pod install && cd ..
yarn ios
```

**Type errors:**
```bash
yarn ts:check
```

## See Also

- [Architecture](./architecture.md)
- [Development Guide](./development-guide.md)
- [Home](./index.md)
