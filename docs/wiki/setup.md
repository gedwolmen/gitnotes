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

Create `.env` (see `.env.example`):

```bash
OPENROUTER_API_KEY=sk-or-...
ANTHROPIC_API_KEY=sk-ant-...
```

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
