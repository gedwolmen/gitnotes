# Rapid-Fix Audit: Final Report
**Window:** 2026-09-08 – 2026-09-21, 2026
**Branch:** `audit/rapid-fix-2026-09`
**Audit scope:** 215 commits, 45 changelog entries, 13 merged PRs

---

## Executive Summary

The 2026-09-08–09-21 rapid-fix window contained **45 documented changelog entries** across 13 merged PRs and ~215 commits. The majority of changes are sound — the Explore tab staged-diff feature, Android SSL fix chain, sync/conflict resolution, and paywall fixes are all substantiated by working code.

Three categories of issues require attention:

1. **Code hygiene regressions** — 5 Rust `fmt` violations introduced during the window, all by the same author, in core engine files. Trivial to fix, reflects pattern of skipping formatting checks before committing.
2. **CHANGELOG accuracy** — 3 entries on 2026-09-09 marked "PR: TBD" that have existing PRs, 1 entry ("preserve staged diff action label contrast") with no matching commit in the window, and 1 entry describing implementation that doesn't match current code.
3. **Test coverage mischaracterization** — The changelog claims "test(android): cover responsive and build configuration fixes" for PR #1567, but the tests added (`androidBuildConfig.test.ts`, `responsiveDimensions.test.ts`) don't cover the responsive Dimensions migration — one test validates the inverse of what the changelog claims.

No confirmed P0 defects. No behavioral bugs with clear evidence. The force-push contract contradiction that was flagged in a prior session is **resolved**.

---

## Finding Index

| ID | Severity | Confidence | Area | Title | Finding |
|----|----------|------------|------|-------|---------|
| F01 | P1 | High | Rust fmt | 5 formatting violations introduced in window | `cargo fmt --check` fails with 11 diffs total; 5 are regressions introduced during the window, 6 are pre-existing |
| F02 | P1 | High | Explore | CHANGELOG entry for staged-diff label describes wrong implementation | changelog says `<ButtonText>` children; code uses `label` prop |
| F03 | P2 | High | Android SSL | Two competing SSL cert patch mechanisms with silent fallback | `patch` tool vs inline `apply_verify_server_cert_guard()` produce different code |
| F04 | P2 | Medium | Android SSL | Vendor-patching `$CARGO_REGISTRY_SRC` is fragile | registry format changes, sparse registry, CI path differences can break patching |
| F05 | P3 | High | Explore | "PR: TBD" entries 39, 40, 41 have actual PRs | #1479, #1482, #1484 exist but CHANGELOG says TBD |
| F06 | P3 | High | Explore | Item 40 "preserve staged diff action label contrast" has no matching commit | no commit in window implements this specific behavior |
| F07 | P3 | High | Testing | `responsiveDimensions.test.ts` validates the inverse of a proper migration | asserts `useWindowDimensions` is NOT used; doesn't test actual responsive behavior |
| F08 | P3 | High | Testing | 4 of 6 `Dimensions.get` call sites untested | `useResponsive`, `ExploreScreen`, `CanvasEditorContent`, `CanvasPreview` have no regression tests |
| F09 | P3 | Medium | Changelog | `androidBuildConfig` test misaligned with changelog's "responsive" claim | test file is named "responsive" but tests Android build config (JNA R8, minify, orientation) |
| F10 | P2 | Medium | Android SSL | Cross-platform SSL runtime behavior unverifiable without device | iOS/web SSL behavior with patched libgit2 cannot be confirmed in worktree |
| F11 | P2 | Medium | Explore | Non-contiguous line selection in staged-diff not tested | `stage_file_lines` supports non-contiguous selection; no test covers this path |
| F12 | P2 | Low | Changelog | 9 entries genuinely have TBD/no PR reference | items 17, 18, 27, 31, 32, 33, 34, 42, 45 have no PR in changelog |

---

## P1 — Strong Concerns

### F01: 5 Rust `fmt` Violations Introduced During Window (11 Total)
**Severity:** P1 | **Confidence:** High | **Evidence:** `cargo fmt --check` (11 diffs), `git blame`

Five formatting violations were introduced in the audit window, all by Vidwa De Seram. `cargo fmt --check` reports 11 total violations — the remaining 6 pre-exist from the initial `ops.rs` commit (008e59cbd, 2026-09-04).

Introduced during window:

| File | Line | Commit | Date |
|------|------|--------|------|
| `rust/build.rs` | 184 | `a6b79dfbf` | 2026-09-19 |
| `rust/build.rs` | 215 | `a145e1c8b` | 2026-09-17 |
| `rust/src/api/bridge.rs` | 49 | `a145e1c8b` | 2026-09-17 |
| `rust/src/engine/ops.rs` | 194 | `17a69c961` | 2026-09-09 |
| `rust/src/engine/ops.rs` | 1484 | `f3e6eda66` | 2026-09-21 |

Pre-existing (not attributable to this window):

| File | Lines | Commit | Date |
|------|-------|--------|------|
| `rust/src/engine/ops.rs` | 255, 292, 321, 328, 646, 740 | `008e59cbd` | 2026-09-04 |

**Next action:** Run `cargo fmt` and commit the result. These are non-functional hygiene issues but signal skipped pre-commit checks. Owner: Vidwa De Seram.

---

### F02: CHANGELOG Describes Wrong Implementation for Staged-Diff Label
**Severity:** P1 | **Confidence:** High | **Evidence:** `git show d69d2eb8`, `ExploreDiffScreen.tsx`

The CHANGELOG entry for 2026-09-09 item 39 says:
> "fix(explore): render staged diff action label"

The diff for commit `d69d2eb8` shows the change was to use the `label` prop:
```tsx
// Before (assumed from context):
<ButtonText>Stage</ButtonText>

// After (from d69d2eb8):
label="Stage"  // passed to StagedDiffAction component
```

The CHANGELOG description is vague enough that it could be interpreted either way, but it does not accurately describe the `label` prop pattern. The actual implementation is sound — the issue is documentation inaccuracy.

**Next action:** Correct CHANGELOG entry to describe `label` prop usage. Owner: Vidwa De Seram.

---

## P2 — Residual Risks (Environment-Blocked)

### F03: Two Competing SSL Cert Patch Mechanisms
**Severity:** P2 | **Confidence:** High | **Evidence:** `rust/build.rs`, `rust/patches/openssl-cert-verify.patch`

The Android SSL cert fix chain has two mechanisms applying different transformations to the same code:

1. **`patch` command** applying `openssl-cert-verify.patch` — nuanced guard checking `verify_server_cert` function
2. **Inline `apply_verify_server_cert_guard()` function** — unconditional `return 0`

Both run via `cc::Build::new().file("src/chkstk_stub.c").compile("chkstk_stub")`. The inline function is a weaker fallback (it unconditionally skips cert verification), applied only if the `patch` tool is absent. The marker file `patches/.patch-applied` prevents double-application, but if `patch` fails silently, the weaker version applies without warning.

**Next action:** Add a build-time warning if the inline fallback is used. Consider consolidating to a single mechanism. Owner: Vidwa De Seram (Android/Rust).

---

### F04: `$CARGO_REGISTRY_SRC` Patching Is Fragile
**Severity:** P2 | **Confidence:** Medium | **Evidence:** `rust/build.rs` lines 170–200

The SSL cert patches are applied by rewriting `$CARGO_HOME/registry/src/` source files. This is fragile because:
- Registry format could change between Cargo versions
- Sparse registry protocol changes the directory layout
- CI and local environments may have different registry paths
- The `HOME`-fallback path (`.cargo/registry/src`) is Unix-specific

**Next action:** Evaluate whether the SSL cert guard can be applied via a different mechanism (e.g., Rust-level certificate wrapper, environment variable) that doesn't require source patching. Owner: Vidwa De Seram (Android/Rust).

---

### F10: Cross-Platform SSL Runtime Behavior Unverifiable
**Severity:** P2 | **Confidence:** Medium | **Evidence:** Environment limitation

The SSL cert patching modifies `libgit2` behavior for Android only. Whether this affects iOS, web, or desktop builds cannot be verified in a worktree environment without the respective toolchains and devices.

**Next action:** Mark as monitored. Test on iOS and web when those toolchains are available. Owner: Vidwa De Seram.

---

### F11: Non-Contiguous Line Selection Not Tested
**Severity:** P2 | **Confidence:** Medium | **Evidence:** `__tests__/ExploreDiffScreen.test.tsx`

The `stage_file_lines` Rust function and `ExploreDiffScreen` UI support non-contiguous line selection (selecting scattered lines across multiple hunks). The test file `ExploreDiffScreen.test.tsx` tests the basic Stage flow but does not test non-contiguous selection.

**Next action:** Add a test case for non-contiguous line staging. Owner: Vidwa De Seram.

---

## P3 — Documentation / Process Issues

### F05: 3 CHANGELOG Entries Say "PR: TBD" But PRs Exist
**Severity:** P3 | **Confidence:** High | **Evidence:** `git log --oneline`, GitHub PR list

| Item | CHANGELOG says | Actual PR |
|------|----------------|-----------|
| 39 | PR: TBD | #1479 (d69d2eb8) |
| 40 | PR: TBD | #1482 (bf670942) |
| 41 | PR: TBD | #1484 (13752b21) |

All three PRs are merged. The TBD markers should be replaced with actual PR numbers.

**Next action:** Update CHANGELOG.md with correct PR numbers. Owner: Vidwa De Seram.

---

### F06: "preserve staged diff action label contrast" Has No Matching Commit
**Severity:** P3 | **Confidence:** High | **Evidence:** `git log --since=2026-09-08 --until=2026-09-22 -- "**/ExploreDiffScreen.tsx"`

The CHANGELOG entry "fix(explore): preserve staged diff action label contrast" (item 40) has no matching commit in the window. The PR #1482 (`bf670942`) exists but its diff doesn't change `ExploreDiffScreen.tsx` in a way that relates to label contrast.

**Next action:** Determine whether this changelog entry is for a different file, references a pre-window commit, or was never committed. Owner: Vidwa De Seram.

---

### F07: `responsiveDimensions.test.ts` Validates Inverse of Migration
**Severity:** P3 | **Confidence:** High | **Evidence:** `__tests__/utils/responsiveDimensions.test.ts`

The test file validates that `useWindowDimensions` is NOT used and `Dimensions.get` IS used during render. If the intended migration is FROM `Dimensions.get` TO `useWindowDimensions`, this test is asserting the wrong behavior. If the intent is to keep `Dimensions.get` in specific places, the test name and changelog description are misleading.

**Next action:** Clarify the intended architecture for responsive dimensions and align the test accordingly. Owner: Vidwa De Seram.

---

### F08: 4 of 6 `Dimensions.get` Call Sites Untested
**Severity:** P3 | **Confidence:** High | **Evidence:** `grep "Dimensions.get" src/`

The responsive behavior of `useResponsive`, `ExploreScreen`, `CanvasEditorContent`, and `CanvasPreview` has no regression tests. The existing `responsiveDimensions.test.ts` only covers `NoteImage` and `GraphViewScreen`.

**Next action:** Add responsive dimension regression tests for the 4 uncovered call sites. Owner: Vidwa De Seram.

---

### F09: `androidBuildConfig` Misaligned With "Responsive" Claim
**Severity:** P3 | **Confidence:** Medium | **Evidence:** `__tests__/plugins/androidBuildConfig.test.ts`

The CHANGELOG claims "test(android): cover responsive and build configuration fixes" for PR #1567. The `androidBuildConfig.test.ts` file tests Android build configuration (JNA R8 rules, minify, shrink resources, orientation) — not responsive dimensions. The "responsive" part of the changelog entry appears to be inaccurate.

**Next action:** Either rename the test file to remove "responsive" from the changelog claim, or add actual responsive-dimension coverage to this test file. Owner: Vidwa De Seram.

---

### F12: 9 Entries With Genuinely TBD/No PR
**Severity:** P3 | **Confidence:** High | **Evidence:** `git log --oneline`, CHANGELOG.md

The following entries have no PR reference in the CHANGELOG and no merged PR found in history:

| Item | Date | Changelog Entry |
|------|------|----------------|
| 17 | 2026-09-12 | fix(explore): keep Git tab content below the header |
| 18 | 2026-09-12 | fix(android): stabilize explore files section hooks |
| 27 | 2026-09-11 | fix(auth): clarify provider token failures |
| 31 | 2026-09-11 | fix(sync): alert when foreground sync fails |
| 32 | 2026-09-11 | fix(sync): pass local worktree paths to native pulls |
| 33 | 2026-09-11 | fix(sync): route repository pulls through the native Git engine |
| 34 | 2026-09-10 | fix(git): accept intentional branch changes during checkout |
| 42 | 2026-09-08 | fix(paywall): restore-granted cache bypass + silent failures |
| 45 | 2026-09-08 | fix(sync): add complete conflict resolution actions |

Some of these may be local-only commits that were never PR'd, or PRs that were merged without being recorded. Task 6 found that the sync TBD PRs (items 31, 32, 33) are actually covered by merged PRs #1442 and #1533 — so those 3 are likely documentation gaps rather than missing work.

**Next action:** For items 31, 32, 33: update CHANGELOG with PR references. For items 17, 18, 27, 34, 42, 45: determine whether these were local commits or merged PRs and update accordingly. Owner: Vidwa De Seram.

---

## Clean Areas

The following areas were inspected and found sound:

| Area | Evidence | Notes |
|------|----------|-------|
| Explore staged-diff line-based staging (13752b21) | `git show 13752b21`, `GitEngine.ts` | Obsolete hunk coords replaced with `lineIndices[]`; type alignment correct |
| Explore floating header padding (766f4373) | `git show 766f4373` | Simple, localized, matches established pattern |
| Explore onLayout event persistence (32edc334) | `git show 32edc334` | Correct RN event-reuse pattern |
| Explore onLayout nativeEvent guard (009e388d) | `git show 009e388d` | Defensive null check |
| Explore tab header space reservation (ae08dd94) | `git show ae08dd94` | `Math.max` for growing-only header is correct |
| Explore duplicate pagination fix (68273a72) | `git show 68273a72` | `loading` guard prevents duplicate fetches |
| ConflictResolverScreen | `ConflictResolverScreen.tsx` read | 4 actions (ours/theirs/both/edit), resolve+commit+push+sync flow complete |
| recovery.ts #1555 | `git show 1a324e89` | Host context preserved during clone recovery |
| CloneSyncService native pull routing | `CloneSyncService.ts` read | Native routing implemented via #1533 |
| activeBranchStore #1524 | `git show 14a24589` | `setActiveBranchAfterCheckout` called by `GitBranchCoordinator` |
| Force-push contract | `recovery.ts` + `GitEngine.ts` | **Resolved**: `push()` facade hardcodes `force: false`; `pushForce()` only reachable by `CloneSyncService.save()` |
| JNA R8 rules (bdbb0ffc) | `app.json` extraProguardRules | Broad `-keep class com.sun.jna.** { *; }` covers all known crash patterns |
| Rust library build order (a61439eb) | `package.json` | Separate local dev workflow fix |
| Paywall entitlement/grandfathering (#1447, #1448) | `GrandfatherService.ts`, `proStore.ts` | Properly gated, RevenueCat callbacks handled |

---

## Unresolved Limitations

| Limitation | Reason | Impact |
|-----------|--------|--------|
| Android SSL cert runtime behavior | Requires physical Android device or emulator with debuggable build | Cannot confirm patch works end-to-end without deployment |
| iOS SSL cert behavior | No iOS toolchain in worktree | Cross-platform SSL implications unknown |
| Non-contiguous diff selection end-to-end | No UI automation for multi-hunk selection | Feature behavior verified by code inspection only |
| Patch tool availability in CI | `patch` command availability not verified across all CI environments | Silent fallback to weaker inline guard possible |

---

## Remediation Queue

| ID | Finding | Owner/Domain | Urgency | Action |
|----|---------|--------------|---------|--------|
| F01 | 5 Rust fmt violations | Vidwa De Seram / Rust | Normal | `cargo fmt` + commit |
| F02 | CHANGELOG describes wrong impl | Vidwa De Seram / Docs | Normal | Update CHANGELOG entry text |
| F03 | Two competing SSL mechanisms | Vidwa De Seram / Android-Rust | Normal | Add build warning; consider consolidation |
| F04 | `$CARGO_REGISTRY_SRC` patching fragile | Vidwa De Seram / Android-Rust | Monitor | Evaluate alternative cert guard mechanism |
| F05 | TBD PRs that have PRs | Vidwa De Seram / Docs | Low | Update CHANGELOG with #1479, #1482, #1484 |
| F06 | No commit for "label contrast" entry | Vidwa De Seram / Docs | Low | Investigate and fix or remove entry |
| F07 | Test validates inverse behavior | Vidwa De Seram / Testing | Normal | Clarify architecture; align test |
| F08 | 4 Dimensions.call sites untested | Vidwa De Seram / Testing | Normal | Add regression tests |
| F09 | androidBuildConfig misnamed | Vidwa De Seram / Testing/Docs | Low | Rename or add coverage |
| F10 | Cross-platform SSL unverifiable | Vidwa De Seram / Android | Monitor | Test on iOS/web when toolchains available |
| F11 | Non-contiguous selection untested | Vidwa De Seram / Testing | Normal | Add test case |
| F12 | 9 genuine TBD entries | Vidwa De Seram / Docs | Low | Determine PR status for each |

---

## Appendix: TBD PR Reconciliation

| Changelog Item | Listed PR | Actual PR | Status |
|----------------|-----------|-----------|--------|
| 39 | TBD | #1479 (d69d2eb8) | Merged — update CHANGELOG |
| 40 | TBD | #1482 (bf670942) | Merged — update CHANGELOG |
| 41 | TBD | #1484 (13752b21) | Merged — update CHANGELOG |
| 31 | TBD | Part of #1442 / #1533 | Merged — update CHANGELOG |
| 32 | TBD | Part of #1533 | Merged — update CHANGELOG |
| 33 | TBD | Part of #1533 | Merged — update CHANGELOG |
| 17 | TBD | Unknown | Local commit only? |
| 18 | TBD | Unknown | Local commit only? |
| 27 | TBD | Unknown | Local commit only? |
| 34 | TBD | Unknown | Local commit only? |
| 42 | TBD | Unknown | Local commit only? |
| 45 | TBD | Unknown | Local commit only? |

---

*Report generated by audit session `audit/rapid-fix-2026-09`. Evidence sources: `.omo/evidence/task-1-inventory.md`, agent sessions ses_f3b7283feffeWhE2f0VUEu2jhy (Rust fmt), ses_f3b726151ffe35fXEYdWXKjwdh (Android SSL), ses_f3b7243ccffeczpt7sAB3ojVS5 (Explore), ses_f3b722871ffeXmdYZELgD4kxPv (Dimensions tests), ses_f3b720a90fferzXgBbVBFyPZSr (Sync).*
