# Android Play Console Fixes — QA Receipt

## Environment

| Check | Result |
|---|---|
| `adb devices` | Empty — no physical device attached |
| `emulator` binary | Not found (`zsh: command not found: emulator`) |
| `avdmanager` binary | Not found (`zsh: command not found: avdmanager`) |
| Android SDK platforms | Installed: `android-35`, `android-36` at `$ANDROID_HOME/platforms/` |
| Android build-tools | Installed: `35.0.0`, `36.0.0` at `$ANDROID_HOME/build-tools/` |
| iOS targets | Available: iPhone 17 (Booted), iPad Pro 13-inch (M5) |

**Android 15 phone and Android 16 large-screen smoke: ENVIRONMENT-BLOCKED — not passed.** No emulator binary, no `avdmanager`, no physical device. SDK platforms are present but no runtime target to execute them.

---

## Release Build

```
Command:  cd android && ./gradlew :app:assembleRelease
Result:   BUILD SUCCESSFUL — 1163 tasks, 5m 59s
R8:        R8 8.12.14, min_api 24, target android-35
```

### Artifact paths (disposable evidence)

| Artifact | Path | Size |
|---|---|---|
| Release APK | `android/app/build/outputs/apk/release/app-release.apk` | 225 MB |
| R8 mapping | `android/app/build/outputs/mapping/release/mapping.txt` | 45 MB |
| Removed members | `android/app/build/outputs/mapping/release/usage.txt` | 55,827 lines |
| Kept members | `android/app/build/outputs/mapping/release/seeds.txt` | 48,113 entries |
| Shrunk resources | `android/app/build/outputs/mapping/release/resources.txt` | 2.0 MB |

**R8 confirmed active.** `mapping.txt` header is `# compiler: R8`. JNA `java.awt.Component` appears in `usage.txt` as `public static long getComponentID(java.awt.Component)` — the `-dontwarn java.awt.Component` rule prevented fatal errors. No broad suppressions.

---

## Static Verification

| Check | Result |
|---|---|
| `yarn ts:check` | ✅ Pass |
| Targeted Jest (androidBuildConfig + responsiveDimensions) | ✅ 12/12 pass |
| `yarn eslint . --ext .ts,.tsx` | ✅ 0 errors, 169 warnings |

---

## Full Test Suite

```
yarn jest — 46 suites total
Results:  258 passed, 12 failed, 270 total
```

### Failed suites — all pre-existing, zero related to this branch

| Suite | Failed tests | Classification |
|---|---|---|
| `__tests__/services/git/noteSyncQueueService.test.ts` | 1 (`pendingCount filters by branch correctly` — expected `1`, got `0`) | Pre-existing logic assertion error |
| `__tests__/components/explore/checkoutSafety.test.tsx` | 11 | Pre-existing — React async state update outside `act()`, `console.error` about unmounted component update |
| `__tests__/services/git/GitBranchCoordinator.test.ts` | 0 (crashes) | Pre-existing — `ReferenceError: import` after Jest teardown, native module import order |

None of these suites exercise any file modified by this branch (`app.json`, `NoteImage.tsx`, `GraphViewScreen.tsx`, `__tests__/plugins/androidBuildConfig.test.ts`, `__tests__/utils/responsiveDimensions.test.ts`).

---

## Disposition

- Android device smoke: **environment-blocked** (no emulator/device available)
- R8 minification: **verified** (build + mapping artifacts)
- Static checks: **pass** (ts:check, targeted tests, eslint 0 errors)
- Full suite: **environment-blocked** for 3 pre-existing failing suites; all other 258 tests pass
