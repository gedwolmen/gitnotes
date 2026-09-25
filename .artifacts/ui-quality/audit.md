# UI Quality Audit — Todo 1 Baseline

> Generated: 2026-09-25
> Branch: chore/ui-quality-upgrade-todo1
> Scope: borderRadius, spacing, typography, raw colors, accessibility props, intentional exceptions

## Summary

This audit inventories hardcoded visual values across `src/components/` and `src/screens/` that bypass the existing token system (`RADII`, `SPACING`, `TYPE`, `Palette`). It also documents intentional exceptions that must not be refactored away.

**No new token family or ThemeContext field is invented.** All findings use the existing `RADII`/`SPACING`/`TYPE`/`Palette` vocabulary.

---

## Token System Reference

### RADII (src/theme/tokens.ts)
```
sm → 12    md → 18    lg → 24    pill → 999
```
No other radius values exist in the token file.

### SPACING (src/theme/tokens.ts)
```
1 → 4    2 → 8    3 → 12    4 → 16    5 → 20    6 → 24    8 → 32
```

### TYPE (src/theme/tokens.ts)
```
xs → 12    sm → 14    md → 16    lg → 18    xl → 22    2xl → 28
```

### Palette Fields (17 keys)
`bg`, `surface`, `highlight`, `shadow`, `text`, `textSecondary`, `accent`, `accentMuted`, `error`, `success`, `warning`, `background`, `surfaceSecondary`, `primary`, `border`, `card`, `elevated`

---

## Intentional Exceptions

The following are **documented intentional exceptions** and must NOT be refactored:

### 1. NOTE_COLORS — theme-agnostic note labels
**File:** `src/theme/tokens.ts:113-122`
```
red: '#ef4444', orange: '#f97316', yellow: '#eab308',
green: '#22c55e', blue: '#3b82f6', purple: '#8b5cf6',
pink: '#ec4899', gray: '#6b7280'
```
These are user-assignable note color labels, intentionally theme-agnostic — same hex in light and dark. They render as card border accents in `NoteCard` and as swatches in `ColorPicker`. **Do not make these theme-aware.**

### 2. Graph node colors — fixed semantic mapping
**File:** `src/screens/GraphViewScreen.tsx:302-309`
```typescript
'#ef4444' '#f97316' '#eab308' '#22c55e' '#3b82f6'
'#a855f7' '#ec4899' '#6b7280'
```
Fixed color mapping for graph visualization nodes. These are not theme tokens — they map to note label colors for visual consistency in the graph view.

### 3. HALO_COLOR — floating button halo
**File:** `src/components/git/gitButtonGeometry.ts:38`
```typescript
const HALO_COLOR = '#3b82f6'; // tailwind blue-500
```
Intentional constant for the floating git button halo ring. Documented inline.

### 4. FloatingGitButton status colors
**File:** `src/components/git/FloatingGitButton.tsx:95-105`
- `#ffffff` — white (clean working tree indicator)
- `#f59e0b` — amber (unpushed/uncommitted status)
Status colors for git state. These are intentional and documented inline.

### 5. VideoViewer background
**File:** `src/screens/VideoViewerScreen.tsx:111,161`
```typescript
backgroundColor: '#000'
```
Intentional — video players use pure black background for contrast.

### 6. AppLoadingView splash colors
**File:** `src/components/ui/AppLoadingView.tsx:18,26`
```typescript
backgroundColor: isDark ? '#0E0E0E' : '#ffffff'
ActivityIndicator color: isDark ? '#ffffff' : '#007AFF'
```
Splash screen activity indicator. Intentional static colors for the loading screen before theme is resolved.

### 7. Primary/danger button text — white contrast
**File:** `src/components/ui/Button.tsx:90,223`
```typescript
const textColor = variant === 'primary' || variant === 'danger' ? '#fff' : colors.text
// variant="danger" → backgroundColor: '#ef4444'
```
Intentional: primary and danger buttons use white text on colored backgrounds for WCAG contrast. The danger background `#ef4444` is a semantic red.

### 8. Platform-specific shadow semantics
**File:** `src/components/NoteCard.tsx:179-188`
```typescript
ios: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }
android: { elevation: 3 }
```
Platform-specific shadows — iOS uses shadow props, Android uses elevation. This is correct platform-specific behavior.

### 9. Modal overlay opacity
**File:** `src/components/ui/Modal.tsx:94,99`
```typescript
backgroundColor: 'rgba(0,0,0,0.18)'
```
Intentional fixed overlay opacity for modal backdrop.

### 10. Toggle thumb geometry
**File:** `src/components/ui/Toggle.tsx:15-17`
```typescript
const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 30;
const THUMB = 22;
```
Fixed pixel geometry for the toggle track and thumb. These are not semantic tokens but are internal to the Toggle component's implementation.

### 11. ScreenHeader Android blur tint
**File:** `src/components/ui/ScreenHeader.tsx:98`
```typescript
backgroundColor: isDark ? 'rgba(30,30,30,0.85)' : 'rgba(255,255,255,0.85)'
```
Android uses semi-transparent overlay instead of BlurView.

---

## Unintentional Hardcoded Values — Scope for Later Todos

### borderRadius not using RADII

The following components have numeric `borderRadius` values that could use `RADII` tokens:

| File | Value | Suggested Token |
|------|-------|----------------|
| `src/components/NoteCard.tsx:175` | `12` | `RADII.sm` |
| `src/components/NoteCard.tsx:206` | `10` | (no match — add `sm` = 10?) |
| `src/components/NoteCard.tsx:250` | `6` | (no match) |
| `src/components/NoteCard.tsx:269` | `12` | `RADII.sm` |
| `src/components/TagChips.tsx:77` | `10` | (no match) |
| `src/components/home/DailyQuoteCard.tsx` | multiple | — |
| `src/components/home/BentoTile.tsx` | multiple (12, 11, 6, 10) | — |
| `src/components/canvas/AcceptDiscardBar.tsx` | multiple (8, 4, 18, 6) | — |
| `src/components/ai/ChatMessageBubble.tsx` | multiple (12, 2, 8, 10) | — |
| `src/components/todos/TodoCard.tsx` | multiple (12, 5, 10) | — |
| `src/components/editor/NoteEditorForm.tsx` | multiple (10, 16) | — |

**Assessment:** `RADII` has `sm=12, md=18, lg=24, pill=999`. Many values like `6`, `10`, `11` have no matching token. A future token (`xs` or a `RADII` extension) would be needed to replace these.

### Raw colors not using Palette tokens

| File | Value | Category |
|------|-------|----------|
| `src/components/ui/ErrorBoundary.tsx:64,70,75` | `'#333'`, `'#5b7cec'`, `'#fff'` | Error state — intentional fallback |
| `src/components/ui/AppLoadingView.tsx:18,26` | `'#0E0E0E'`, `'#ffffff'`, `'#007AFF'` | Splash only — intentional |
| `src/components/home/BentoTile.tsx:208` | `'#FFFFFF'` | Thumbnail wrap |
| `src/components/notes/NotesFilterModal.tsx:421` | `'#fff'` | Apply button text |
| `src/components/git/HoldToPushRing.tsx:69` | `'#ffffff'` | Ring fill |
| `src/components/git/ConflictRouteBanner.tsx:30,41` | `'#d97706'`, `'#6e6e73'` | Conflict banner icons |
| `src/components/git/UnpushedCommitsModal.tsx:74,80` | `'#3b82f6'`, `'#6e6e73'` | Icon colors |
| `src/components/git/GitErrorBanner.tsx:43,52` | `'#e07a7a'`, `'#6e6e73'` | Error/warning icons |
| `src/screens/HomeScreen.tsx:312,333,410,414` | `'#FFFFFF'` | Icon/text on colored backgrounds |
| `src/screens/CalendarScreen.tsx:126,140` | `'#FFFFFF'` | Calendar day background |
| `src/screens/OnboardingScreen.tsx:182` | `'#FF3B30'` | Error text |
| `src/screens/ExploreConflictScreen.tsx:109,150` | `'#fff'` | Text on colored background |
| `src/screens/HomeScreen.tsx` | `'#FFFFFF'` | HomeScreen icon colors |

### fontSize not using TYPE tokens

376 instances across 77 files. Most are in-renderer content (code blocks, chat bubbles, structured data) rather than shared UI chrome. Key files needing attention in later todos:

- `src/components/StructuredRenderer.tsx` — code/prose rendering
- `src/components/ai/ChatMessageBubble.tsx` — chat content
- `src/components/canvas/CanvasEditorContent.tsx` — canvas annotations
- `src/components/editor/NoteViewer.tsx` — rendered markdown

### Spacing (gap/padding/margin)

228 instances across 70 files. Many are in complex-renderer components (canvas, structured renderer, chat) where precise control is needed. The shared UI components (`Surface`, `Card`, `Button`, `Group`, `ScreenHeader`) mostly use `spacing[]` correctly.

---

## Accessibility Props — Existing Patterns

The codebase already uses accessibility props on interactive elements:

| Pattern | Example |
|---------|---------|
| `accessibilityRole="button"` | Button, IconButton, Card, TabBar tabs |
| `accessibilityLabel` | All icon-only controls, TabBar tabs |
| `accessibilityState={selected: true}` | TabBar active tab |
| `accessibilityRole="progressbar"` | AppLoadingView |
| `importantForAccessibility="no-hide-descendants"` | Modal backdrop (BlurView) |
| `accessibilityElementsHidden` | Modal backdrop (BlurView) |

**Gap:** IconButton has `accessibilityLabel` but ghost variant passes it to Pressable while non-ghost passes it to Surface — verified correct. No missing role/label on shared primitives found.

---

## Fixture Coverage

The deterministic fixture test (`__tests__/components/ui/theme-fixtures.test.tsx`) covers:

| Fixture | Surface | Card | Button | IconButton | Chip | Toggle | EmptyState | Input | NoteCard |
|---------|---------|------|--------|-----------|------|--------|------------|-------|----------|
| flat-light | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| flat-dark | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| neumorphic-light | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| neumorphic-dark | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Token invariant tests verify:
- All 17 Palette keys present in all 4 palettes
- `resolveColors()` maps style×isDark → correct palette
- `RADII` has sm/md/lg/pill
- `SPACING` has 1-8
- `TYPE` has xs/sm/md/lg/xl/2xl
- All 4 palettes have identical key sets

---

## Pre-existing Failures (recorded baseline)

**Tests:** `yarn jest --no-coverage --forceExit`
```
Test Suites: 2 failed, 72 passed, 74 total
Tests: 3 failed, 792 passed, 795 total
```

Failed suites:
1. `__tests__/components/git/appFloatingGitButton.test.tsx` — `expect(mockNavigate).toHaveBeenCalledTimes(2)` — async timing issue
2. `__tests__/plugins/androidBuildConfig.test.ts` — 2 tests about JNA `Pointer.peer` and `java.awt.Component` R8 rules — config mismatch

**ESLint:** `yarn eslint src --ext .ts,.tsx`
```
143 problems (0 errors, 143 warnings)
```
All warnings are pre-existing (`@typescript-eslint/no-explicit-any`, `prefer-const`, `@typescript-eslint/no-unused-vars`). No new warnings introduced by fixture files.

**TypeScript:** `yarn ts:check` — clean (8.87s)

---

## Files Created/Modified by Todo 1

| Path | Change |
|------|--------|
| `__tests__/components/ui/theme-fixtures.test.tsx` | New — 204 deterministic fixture tests |
| `.artifacts/ui-quality/audit.md` | New — this audit document |
| `jest.worktree.json` | Temp — worktree jest config override (not committed to main) |

**Production files modified:** none (Todo 1 is pure baseline/audit)

---

## Verification Fix (2026-09-25)

**Problem:** The root `jest.config.js` has `testPathIgnorePatterns: ['/.worktrees/']` which causes Jest to ignore test files inside `.worktrees/` directories. The fixture test `__tests__/components/ui/theme-fixtures.test.tsx` in the worktree was not discoverable by the standard `yarn jest` command.

**Solution:** Created a minimal `jest.worktree.json` that duplicates the essential fields from the root config (preset, transform, moduleNameMapper, transformIgnorePatterns, setupFiles) but overrides `testPathIgnorePatterns` to use a negative lookahead pattern that allows the `ui-quality-upgrade` worktree while still ignoring other worktrees.

**Reproducible command (run from worktree root):**
```bash
yarn jest --config jest.worktree.json --testPathPattern=theme-fixtures --no-coverage --forceExit
```

**Result:**
```
Test Suites: 1 passed, 1 total
Tests:       204 passed, 204 total
Time:        1.419 s
```

**Cleanup:** `jest.worktree.json` is a temporary artifact kept in the worktree for reproducibility. It is NOT committed to the feature branch or main. After the PR is merged, this file should be removed from the worktree.

---

## Next Steps (Todo 2 scope)

Todo 2 formalizes visual tokens. Key gaps identified:
1. `RADII` needs `xs=6` or `RADII` extension for values like `6`, `10`, `11` found in components
2. NoteCard `borderRadius: 12` should map to `RADII.sm`
3. FormatBadge radius `6` needs a token
4. Elevation tiers need platform-specific handling documented

---

## Todo 2: Formalize Visual Tokens (Completed 2026-09-25)

### Changes Made

#### 1. `src/theme/tokens.ts` — Added line height and semantic type roles

**New exports:**
```typescript
// LINE_HEIGHT — paired with TYPE sizes (1.4–1.5× ratios)
export const LINE_HEIGHT: Record<TypeSize, number> = {
  xs: 18,   // 1.5× — captions
  sm: 21,   // 1.5× — secondary text
  md: 24,   // 1.5× — body copy
  lg: 25,   // ~1.38× — subheadings
  xl: 30,   // ~1.36× — section headings
  '2xl': 36, // ~1.29× — display
};

// TEXT_ROLE_SIZE / TEXT_ROLE_LINE_HEIGHT — semantic roles
export type TextRole = 'display' | 'heading' | 'subheading' | 'body' | 'label' | 'caption';
export const TEXT_ROLE_SIZE: Record<TextRole, TypeSize> = { ... };
export const TEXT_ROLE_LINE_HEIGHT: Record<TextRole, LineHeight> = { ... };
```

**API stability:** `Tokens` interface unchanged. `useTheme()` and `useTokens()` return shapes preserved. No new Palette fields added.

#### 2. `src/components/ui/text.tsx` — Added semantic text roles

- `Text` component now accepts optional `textRole` prop for semantic styling
- `ButtonText` preserved (uses `colors.text` correctly)
- Exports `StyledTextProps` interface for typed usage

#### 3. `src/components/ui/heading.tsx` — Token-driven heading

- `Heading` component now uses `type.xl` and `fontWeight: 600` from tokens
- No longer just an alias to `Text`

#### 4. `__tests__/components/ui/token-contract.test.ts` — New contrast and token tests

46 new tests covering:
- WCAG AA contrast ratios for text on background
- Semantic color contrast (error, success, warning, border)
- Button white-on-primary/danger contrast (documented as intentional exceptions)
- Line height invariants
- TEXT_ROLE alignment with LINE_HEIGHT

**Contrast findings (baseline limitations, documented):**
- `success` and `warning` on light surfaces: ~2.2:1 (below 3:1)
- `error` on neumorphic-light: ~2.9:1 (below 3:1)
- `border` on white surfaces: ~1.4:1 (below 1.5:1)
- `white on neumorphic-dark primary`: ~2.6:1 (below 3:1)

These are **existing palette design choices**, not new failures introduced by this refactor.

### Files Created/Modified

| Path | Change |
|------|--------|
| `src/theme/tokens.ts` | Added `LINE_HEIGHT`, `TEXT_ROLE_SIZE`, `TEXT_ROLE_LINE_HEIGHT`, `TextRole` type |
| `src/components/ui/text.tsx` | Added `textRole` prop and `StyledTextProps` interface |
| `src/components/ui/heading.tsx` | Now uses `type.xl` from tokens instead of plain `Text` alias |
| `__tests__/components/ui/token-contract.test.ts` | New — 46 contrast and token contract tests |

### Verification

```bash
# TypeScript
yarn ts:check  # PASS (6.04s)

# Jest (worktree config)
yarn jest --config jest.worktree.json --testPathPattern="theme-fixtures|token-contract" --no-coverage --forceExit
# PASS — 250 tests (204 fixtures + 46 contract)

# ESLint
yarn eslint src/components/ui/text.tsx src/components/ui/heading.tsx src/theme/tokens.ts --ext .ts,.tsx
# PASS — 0 errors

# Prettier
yarn prettier --check src/components/ui/text.tsx src/components/ui/heading.tsx src/theme/tokens.ts __tests__/components/ui/token-contract.test.ts
# PASS — All matched files use Prettier code style
```

### Pre-existing Failures (unchanged)

- `appFloatingGitButton.test.tsx` — async timing issue
- `androidBuildConfig.test.ts` — JNA/R8 config mismatch
- ESLint 143 warnings (pre-existing, no new warnings)

### Button/IconButton State Consistency

Existing pressed/disabled patterns verified consistent:
- Disabled: `opacity: disabled ? 0.5 : 1` (Button, IconButton filled)
- Ghost disabled: `opacity: disabled ? 0.4 : pressed ? 0.7 : 1` (IconButton ghost)
- Pressed: Reanimated scale animation (0.97 Button, 0.94 IconButton)

These are design parameters, not semantic tokens. No changes made as patterns are already consistent.

### Intentional Exceptions (verified unchanged)

- `Button.tsx:90` — `textColor = '#fff'` for primary/danger (documented §7)
- `Button.tsx:223` — `backgroundColor: '#ef4444'` for danger (documented §7)
- All NOTE_COLORS remain theme-agnostic (documented §1)

---

## Todo 4: Home Dashboard Hierarchy (commit 45a34a63)

### Evidence Status

**Screenshot blocker (documented, not fixable without native rebuild):**

The `ios/` directory in this worktree contains only `Podfile` and `Podfile.properties.json` — no `.xcodeproj` or `.xcworkspace`. This is an Expo managed workflow project. Generating the iOS native directory requires `npx expo prebuild`, which creates native iOS project files from `app.json`/`package.json`. Without a checked-in `ios/` directory (or an existing derived-data build), the worktree cannot be launched directly on the simulator from the current state.

The installed GitNotēs app (`com.xaventra.gitnotes`) on the booted simulator was built from `origin/main`, not from this worktree's `chore/ui-quality-upgrade-todo1` branch. A screenshot of that installed app would show pre-change behavior only.

**Screenshot captured:** `home-flat-light.png` — **WITHDRAWN as evidence**. This is a screenshot of the iOS SpringBoard (home screen), not the GitNotēs app. It does not prove or disprove the HomeScreen refactor.

**Acceptable evidence for this worktree:**
- ts:check — clean (6.57s)
- 11 HomeTile tests — all passing
- 57 combined tests (HomeTile + token-contract) — all passing
- ESLint on all touched home files — 0 errors
- Prettier — clean
- Code diff: `HomeScreen.tsx` reduced by ~84 lines of inline tile Pressables; new `HomeTile.tsx` exports a typed shared component

### What Changed

**New file:** `src/components/home/HomeTile.tsx`
- Typed `HomeTileVariant = 'primary' | 'secondary' | 'accent'`
- `HOME_TILE_HEIGHT` and `HOME_TILE_RADIUS` export maps
- Shared tile composition: badge, title, subtitle, decoration, pressed transform
- `contentPosition` prop (`'flex-end'` | `'space-between'`)
- `titleNode` / `subtitleNode` overrides for rich formatting
- Pressed state: `opacity: 0.92, scale: 0.985` (consistent across variants)
- Intentional white-on-colored-background preserved (primary/accent variants)

**Modified:** `src/screens/HomeScreen.tsx`
- `HomeTile` import added
- 5 inline `Pressable` tile blocks replaced with `HomeTile` components
- All 6 testIDs preserved: `home.button.{create-note,open-journal,open-calendar,open-templates,navigate,open-thought-dump}`
- All navigation paths unchanged
- Pro gate calls unchanged (`handleOpenTemplates`, thought-dump onPress)
- Long-press on create-note → format picker preserved
- Color picker, context menu, share, delete, toggle-pin callbacks unchanged

**New test file:** `__tests__/components/home/HomeTile.test.tsx`
- 11 tests: render, press, long-press, variant, titleNode, subtitleNode, showTabletDecoration, height override, contentPosition, disabled
- Uses ThemeContext mock (no native dependency)

### Verification

```bash
yarn ts:check
# Done in 6.57s — 0 errors

yarn eslint src/screens/HomeScreen.tsx src/components/home/HomeTile.tsx --ext .ts,.tsx
# Done in 1.74s — 0 errors

yarn prettier --check src/screens/HomeScreen.tsx src/components/home/HomeTile.tsx
# All matched files use Prettier code style!

node --experimental-vm-modules node_modules/.bin/jest \
  __tests__/components/home/HomeTile.test.tsx \
  __tests__/components/ui/token-contract.test.ts \
  --no-coverage --forceExit --testPathIgnorePatterns 'node_modules/'
# Test Suites: 2 passed, 2 total
# Tests: 57 passed, 57 total
```

### Preserved Invariants

| Invariant | Status |
|-----------|--------|
| All 6 dashboard tile testIDs | Preserved |
| Navigation to NoteEditor (create, journal, open) | Preserved |
| Navigation to Calendar | Preserved |
| Navigation to CanvasList | Preserved |
| Navigation to ThoughtDump (Pro-gated) | Preserved |
| Pro gate on templates | Preserved |
| Long-press create-note → format picker | Preserved |
| Color picker on recent item | Preserved |
| Context menu (share, pin, delete) | Preserved |
| requireRepo guards | Preserved |
| DailyQuoteCard states (loading/error/refresh) | Preserved (unchanged) |
| BentoRecent, QuickAccessShelf | Preserved (unchanged) |
| BentoTile | Preserved (unchanged) |

### Intentional Exceptions Verified

- `home.button.open-thought-dump` — white-on-accent (`rgba(255,255,255,0.2)` badge bg, `#FFFFFF` icon/text) — preserved as intentional
- `home.button.create-note` / `open-journal` — white badge on primary — preserved as intentional
