# Development Guide

> Local setup, build, test, lint workflow.

## Prerequisites

- **Node.js** 20.18+ (check: `node --version`)
- **Yarn** 1.22 (check: `yarn --version`)
- **Xcode** 15+ (for iOS)
- **Android Studio** (for Android)
- **Git** 2.30+

## Setup

```bash
# Clone
git clone https://github.com/gedwolmen/gitnotes.git
cd gitnotes

# Install dependencies
yarn install

# Install iOS pods (macOS only)
cd ios && pod install && cd ..

# Start Metro bundler
yarn start

# Run on iOS
yarn ios

# Run on Android
yarn android

# Run on web
yarn dev
```

## Environment Variables

Create `.env` (see `.env.example`):

```bash
OPENROUTER_API_KEY=sk-or-...
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
```

## Common Commands

### Development

```bash
yarn start                  # Start Metro
yarn ios                    # Run on iOS
yarn android                # Run on Android
yarn dev                    # Run on web (Expo)
yarn clean                  # CleanMetro cache
yarn reset                  # Reset all caches
```

### Testing

```bash
yarn jest                   # Run all tests
yarn jest --watch           # Watch mode
yarn jest --coverage        # Coverage report
yarn jest path/to/test.ts   # Specific file
yarn ts:check               # Type check (tsc --noEmit)
```

### Linting & Formatting

```bash
yarn eslint . --ext .ts,.tsx    # Lint
yarn eslint . --ext .ts,.tsx --fix  # Auto-fix
yarn prettier --write .         # Format all
yarn lint                       # eslint + prettier
```

### Git

```bash
yarn commit                 # Interactive commit (commitizen)
yarn release                # Semantic release (bump version)
```

## Build & Deploy

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## Troubleshooting

### Metro bundler issues

```bash
# Clear cache
yarn start --clear

# Reset all
watchman watch-del-all
rm -rf node_modules/
yarn install
yarn start --clear
```

### iOS build issues

```bash
# Clean pods
cd ios
rm -rf Pods/ Podfile.lock
pod install
cd ..
yarn ios
```

### Type errors

```bash
# Regenerate types
yarn generate-types

# Check all
yarn ts:check
```

## Project Structure

```
gitnotes/
├── src/
│   ├── components/     # UI components
│   ├── contexts/       # React contexts
│   ├── hooks/          # Custom hooks
│   ├── i18n/           # Localization
│   ├── models/         # TypeScript interfaces
│   ├── navigation/     # Nav config
│   ├── screens/        # Screen components
│   ├── services/       # Business logic
│   ├── stores/         # Zustand stores
│   ├── theme/          # NativeWind theme
│   └── types/          # Shared types
├── __tests__/          # Jest tests
├── docs/               # Documentation
├── ios/                # Native iOS code
├── android/            # Native Android code
├── assets/             # Images, fonts
├── AGENTS.md           # AI agent rules
└── package.json        # Dependencies
```

## Contributing

1. Fork the repo
2. Create a feature branch (`feature/my-feature`)
3. Make changes, add tests
4. Run `yarn lint` and `yarn jest`
5. Commit with descriptive message
6. Push and open a PR

See `CONTRIBUTING.md` for detailed guidelines.
