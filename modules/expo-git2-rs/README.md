# expo-git2-rs

Native Git operations via git2-rs for Expo/React Native iOS and Android.

## Status

**Development-only.** This module is part of the GitNotēs git2-rs migration.
Not yet functional — full implementation in progress.

## Requirements

- Rust 1.75+
- Android NDK
- Xcode 15+
- Expo SDK 56+ (development build)

## Building

```bash
# Install Rust targets
./scripts/build-rust.sh

# Build in development build
npx expo run:ios --variant Debug
npx expo run:android --variant Debug
```

## License

GPL-3.0 — derivative of [GitSync](https://github.com/ViscousPot/GitSync).
