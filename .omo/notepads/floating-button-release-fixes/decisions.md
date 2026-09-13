# Task 8 Decisions

## macOS timeout command
macOS does not ship with `timeout` command. Used `perl -e 'alarm(N); exec(@ARGV)'` as fallback for command timeouts.

## EAS local build vs cloud build
EAS local build succeeds (arm64 Release) despite local xcodebuild failing (x86_64 linker issue with arm64-only static library). EAS builds in the cloud with arm64-only toolchain, bypassing the x86_64 simulator issue.

## Task 8 Additional Findings

### Simulator Launch Blocker
The EAS production build uses app-store export method, which signs the app for device distribution.
This signing prevents the app from being launched on iOS Simulator via simctl.
To get simulator-compatible builds, would need a simulator-specific EAS profile or local xcodebuild.

### IPA Inspection Method
1. unzip IPA to /tmp/eas-ipa-inspect/
2. lipo -info Payload/AppName.app/AppName (architecture)
3. strings Payload/AppName.app/AppName | grep (symbols)
4. xcrun simctl install booted Payload/AppName.app (install)
5. xcrun simctl launch booted com.bundle.id (launch - fails with app-store signing)

### arm64 Static Library Issue
libgitnotes_git2.a is arm64-only. When xcodebuild tries to build for x86_64 simulator,
the linker fails because the library lacks x86_64 slices. This is a pre-existing build
environment issue, not related to the floating-button changes.


## arm64-only Simulator Build Discovery (2026-09-13)

### Problem
Local xcodebuild for simulator failed with x86_64 linker error because libgitnotes_git2.a is arm64-only.

### Solution
Build with explicit architecture flags:
xcodebuild ... ARCHS=arm64 EXCLUDED_ARCHS=x86_64 ONLY_ACTIVE_ARCH=YES -destination 'platform=iOS Simulator,id=UUID'

This produces an arm64-only simulator build that succeeds.

### Tradeoff
The arm64 simulator build crashes on launch (Hermes/Skia/simulator native module issue).
The EAS arm64 device build works (verified with IPA inspection).

### Runtime Verification Status
- arm64 simulator build: BUILD SUCCEEDED ✓
- App install: SUCCESS ✓
- App launch: CRASH before UI — arm64/simulator Skia/Hermes regression (pre-existing; verified with task-8-crash-screen.png) ⚠
- Floating button interaction: NOT ACHIEVED (app crashes before UI)

