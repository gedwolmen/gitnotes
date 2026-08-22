# Simulator Keychain Entitlement — SecureStore Fix

`expo-secure-store` stores values in the iOS keychain. On the simulator this
fails on every read/write with:

```
KeyChainException: A required entitlement isn't present.
(at ExpoSecureStore/SecureStoreModule.swift:168)  code: 'ERR_KEY_CHAIN'
```

`expo-notifications` shows the same class of failure:

```
ERR_NOTIFICATIONS_KEYCHAIN_ACCESS: undefined reason
(at ExpoNotifications/ServerRegistrationModule.swift:161)
```

## Root cause

The iOS keychain requires the `keychain-access-groups` entitlement. Expo's own
`expo-secure-store` config plugin only wires `NSFaceIDUsageDescription` and the
Android backup rules — it does **not** add the keychain group. The generated
`ios/` project's `GitNots.entitlements` only contained `aps-environment`, so
SecureStore had no keychain group and every access threw.

Because `ios/` is produced by `expo prebuild` (gitignored), editing the
entitlements file directly would be wiped on the next prebuild.

## Fix

A config plugin `plugins/withKeychainAccessGroup.js` injects
`keychain-access-groups` = `$(AppIdentifierPrefix)$(CFBundleIdentifier)` into
the entitlements plist at prebuild time, registered in `app.json` right after
`expo-secure-store`.

- `$(AppIdentifierPrefix)` is resolved by Xcode from the signing team.
- On the simulator (ad-hoc signing) it resolves to the simulator keychain
  group, which is what SecureStore reads.
- On a device it resolves to the app's own keychain group.

## Verification

- Before: every `SecureStore` read/write logged
  `ERR_KEY_CHAIN: A required entitlement isn't present`; AI settings and
  account tokens failed to load; the repo list could appear empty after a
  reinstall because the account token could not persist.
- After: `expo prebuild` produces `GitNots.entitlements` containing
  `keychain-access-groups`; SecureStore reads/writes succeed on the simulator.
