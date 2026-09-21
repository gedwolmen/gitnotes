# Evidence: Todo 1 — Changelog-to-History Inventory

## Date Window
2026-09-08 through 2026-09-21 inclusive.

## Git Log Commit Count
```
215 commits in window (git log --since=2026-09-08 --until=2026-09-22)
```

## Changelog Entries in Window (by date section)

| # | Date | Changelog Entry | PR Ref | Git Commit(s) | Changed Files | Status |
|---|------|----------------|--------|---------------|---------------|--------|
| 1 | 2026-09-21 | fix(explore): prevent duplicate commit pagination during initial load | #1677 | `5905ff1` (merge), `68273a7` (impl) | CHANGELOG.md, CommitsSection.tsx, CommitsSection.test.tsx | OK — 3-file fix with test |
| 2 | 2026-09-21 | fix(notes): deduplicate persisted note index IDs | #1676 | `d527ecdf` (merge), `07670ac` (impl) | CHANGELOG.md, notes-related files | OK |
| 3 | 2026-09-20 | fix(android): preserve JNA direct mapping through R8 | present in log | `bdbb0ffc` (impl) | CHANGELOG.md, app.json | OK |
| 4 | 2026-09-20 | fix(android): build Rust library before local Android launch | present in log | found as local commit | package.json scripts | OK |
| 5 | 2026-09-19 | fix(android): unconditionally skip native SSL cert errors on Android | #1644 | `654799fc` | CHANGELOG.md, rust/build.rs patch | CONCERN — see Todo 3 |
| 6 | 2026-09-19 | fix(notes): prevent duplicate note file when editing title | #1635 | `0c88f45ee4` | note editor files | OK — PR listed |
| 7 | 2026-09-19 | fix(android): apply SSL cert patches via corrected registry source path | noted | `a6b79dfbf` | build.rs | CONCERN — see Todo 3 |
| 8 | 2026-09-17 | fix(android): resolve Android TLS certificate verification failures | #1625, #1627 | `a145e1c8` | build.rs, libgit2 patches | CONCERN — layered fix, see Todo 3 |
| 9 | 2026-09-17 | fix(android): preserve JNA Pointer.peer through R8 minification | #1618 | `9466b8bb` | app.json extraProguardRules | OK |
| 10 | 2026-09-14 | fix(canvas): render strokes during gesture updates | #1580 | `96644d25` | canvas worklet files | OK |
| 11 | 2026-09-14 | fix(canvas): remove worklet path mutation warnings and inset launch spinner | #1578 | `6dd73085` | canvas + Skia files | OK |
| 12 | 2026-09-14 | fix(skia): eliminate deprecated Skia path API deprecation warnings in runner | PR in log | `574ae083` | Skia PathBuilder migration | OK |
| 13 | 2026-09-14 | fix(app,settings): show loading indicator on launch and handle PAT access errors | present | `6af95c82` | App.tsx, Settings files | OK |
| 14 | 2026-09-13 | fix(explore): persist event and capture layout before reading in onLayout | #1573 | `32edc334` | Explore onLayout handlers | OK |
| 15 | 2026-09-13 | fix(explore): guard onLayout event.nativeEvent against null | #1572 | `009e388d` | Explore onLayout handlers | OK |
| 16 | 2026-09-13 | fix(explore): reserve section tab header space | #1571 | `ae08dd94` | section tab components | OK |
| 17 | 2026-09-12 | fix(explore): keep Git tab content below the header | none listed | local commits | CHANGELOG only, no PR | FLAG: TBD PR |
| 18 | 2026-09-12 | fix(android): stabilize explore files section hooks | none listed | local commits | hook ordering fixes | FLAG: TBD PR |
| 19 | 2026-09-11 | fix(android): avoid dimension hooks in affected render paths | #1568 | `2e126878` | NoteImage, GraphViewScreen | OK |
| 20 | 2026-09-11 | fix(ios): generate valid Swift flags in CocoaPods Podfile | #1563 | `f7d8608` | Expo config plugin | OK |
| 21 | 2026-09-11 | fix(android): allow system-default orientation | #1567 | merged in log | app.json orientation | OK |
| 22 | 2026-09-11 | fix(ui): recompute layout dimensions on resize | #1567 | merged in log | Dimensions hook migration | OK |
| 23 | 2026-09-11 | test(android): cover responsive and build configuration fixes | #1567 | merged in log | androidBuildConfig.test.ts, responsiveDimensions.test.ts | TEST FILES EXIST — see Todo 5 |
| 24 | 2026-09-11 | fix(android): migrate app-owned edge-to-edge handling | #1567 | merged in log | edge-to-edge audit | OK |
| 25 | 2026-09-11 | fix(android): enable R8 minification and resource shrinking for release builds | #1567 | merged in log | expo-build-properties config | OK |
| 26 | 2026-09-11 | fix(sync): preserve repository host during clone recovery | #1555 | `e4ef062e` | GitFsService, recovery.ts | OK |
| 27 | 2026-09-11 | fix(auth): clarify provider token failures | TBD | local commit | auth error messages | FLAG: TBD PR |
| 28 | 2026-09-11 | fix(sync): preserve repository identity during clone recovery | #1545 | `1a324e89` | recovery.ts, clone paths | OK — PR listed |
| 29 | 2026-09-11 | fix(notes): preserve repository modification dates | #1543 | `d2b731b` | note import path | OK — PR listed |
| 30 | 2026-09-11 | fix(sync): stabilize activity labels and recover missing Git objects | Follow-up to #1533 | `b33ad397` | sync labels, corruption recovery | OK |
| 31 | 2026-09-11 | fix(sync): alert when foreground sync fails | TBD | local commit | sync alert UI | FLAG: TBD PR |
| 32 | 2026-09-11 | fix(sync): pass local worktree paths to native pulls | TBD | `5b50d437` | GitFsService, native bridge | FLAG: TBD PR |
| 33 | 2026-09-11 | fix(sync): route repository pulls through the native Git engine | TBD | `1e59a82b` | CloneSyncService, GitEngine facade | FLAG: TBD PR |
| 34 | 2026-09-10 | fix(git): accept intentional branch changes during checkout | TBD | `14a24589` | checkout validation | FLAG: TBD PR |
| 35 | 2026-09-10 | fix(git): refresh branch-backed app state after checkout | #1524 | merged in log | branch-backed stores | OK — PR listed |
| 36 | 2026-09-10 | fix(android): align recent commits pagination parameters | #1511 | merged in log | Android GitEngine bridge | OK |
| 37 | 2026-09-10 | fix(ios): keep GitEngine module maps out of Sources | #1510 | merged in log | Xcode build config | OK |
| 38 | 2026-09-09 | fix(ios): disable explicit modules for ExpoSQLite on Xcode 26 | #1490 | merged in log | Expo config plugin | OK |
| 39 | 2026-09-09 | fix(explore): render staged diff action label | TBD | `d69d2eb8` (#1479) | ExploreDiffScreen.tsx | FLAG: changelog says TBD but commit shows PR #1479 |
| 40 | 2026-09-09 | fix(explore): preserve staged diff action label contrast | TBD | `bf670942` (#1482) | ExploreDiffScreen.tsx | FLAG: changelog says TBD but commit shows PR #1482 |
| 41 | 2026-09-09 | fix(explore): stage selected diff lines | TBD | `13752b21` (#1484) | ExploreDiffScreen.tsx, GitEngine.ts | FLAG: changelog says TBD but commit shows PR #1484 |
| 42 | 2026-09-08 | fix(paywall): restore-granted cache bypass + silent failures | TBD | local commits | GrandfatherService, proStore | FLAG: TBD PR |
| 43 | 2026-09-08 | fix(paywall): sync Pro state on RevenueCat callbacks and account binds | #1448 | merged in log | proStore entitlements | OK — PR listed |
| 44 | 2026-09-08 | fix(paywall): iOS grandfathering cache race condition | #1447 | merged in log | GrandfatherService caching | OK — PR listed |
| 45 | 2026-09-08 | fix(sync): add complete conflict resolution actions | TBD | local commits | ConflictResolverScreen | FLAG: TBD PR |

## Summary
- Total changelog entries in window: **45**
- Entries with `PR: TBD` or no PR: **10** (items 17, 18, 27, 31, 32, 33, 34, 39, 40, 41, 42, 45)
- Entries where changelog says TBD but actual PR exists in history: **3** (items 39, 40, 41 — all on 2026-09-09)

## Verification Commands Used
```bash
git log --since=2026-09-08 --until=2026-09-22 --date=short --pretty=format:'%H|%ad|%s'
git log --merges --since=2026-09-08 --until=2026-09-22 --date=short --oneline
git show <hash> --stat
```
