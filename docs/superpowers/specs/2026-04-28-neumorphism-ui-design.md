# Neumorphism UI Conversion — Design Spec

**Date:** 2026-04-28
**Branch:** `feat/neumorphism-ui`
**Status:** Approved by user (full conversion authorized on new branch)

## Goal

Convert all UI surfaces in the gitnotes Expo / React Native app from the current iOS-style flat design to a neumorphic ("soft-UI") aesthetic. Preserve readability of content surfaces (markdown editor body, canvas, media viewers). Provide a per-user opt-out toggle to revert to the existing flat style.

## Decisions Locked During Brainstorm

| # | Decision |
|---|----------|
| Q1 | Scope: full conversion — all screens + all components |
| Q2 | Both light and dark modes neumorphic; user-facing "Flat" fallback toggle in Settings |
| Q3 | Shadow tech: pure-RN two-`View` sandwich (no new dependencies) |
| Q4 | Three elevation tiers: `subtle` / `raised` / `floating`; pressed = `inset` |
| Q5 | Pillowy radii: `sm 12 / md 18 / lg 24 / pill 999` |
| Q6 | Press feedback: `inset` + Reanimated scale `0.97` + `expo-haptics` selection |
| Q7 | Accent: periwinkle `#7B8CDE` (light) / `#8B9BE8` (dark); used only for icons + active-state accents |
| Q8 | Inputs: always `inset` |
| Q9 | Long lists: grouped raised container with internal flat rows (one shadow per group) |
| Q10 | Modals: `floating` over `expo-blur` BlurView scrim |
| Q11 | Bottom tab bar: detached floating pill; active tab = inset pocket |
| Q12 | Editors: content area flat; surrounding toolbar / statusbar neumorphic frames |
| Q13 | Migration: build neumorphic primitives first, gate via `style` flag, migrate screens phase-by-phase |

## Section 1 — Design Tokens

New file: `src/theme/tokens.ts`. Single source of truth.

### Palette

```
light:
  bg:            #E0E5EC
  surface:       #E0E5EC   (intentional — neumorphism uses bg-tone surfaces)
  highlight:     #FFFFFF
  shadow:        #A3B1C6
  text:          #2D3142
  textSecondary: #6B7280
  accent:        #7B8CDE
  accentMuted:   #A8B3E5
  error:         #E07A7A

dark:
  bg:            #2A2D3A
  surface:       #2A2D3A
  highlight:     #353945
  shadow:        #1F2129
  text:          #E4E6EB
  textSecondary: #9097A6
  accent:        #8B9BE8
  accentMuted:   #5A6BB5
  error:         #E07A7A
```

### Radii

`sm 12 / md 18 / lg 24 / pill 999`

### Spacing

`1=4 / 2=8 / 3=12 / 4=16 / 5=20 / 6=24 / 8=32`

### Elevation tiers (sandwich shadow)

```
subtle:   { offset: 2,  blur: 4  }
raised:   { offset: 4,  blur: 8  }
floating: { offset: 8,  blur: 16 }
inset:    same offsets, inverted layer order, simulated via inner gradient Views
```

### Typography

System font (no font in deps). Sizes: `xs=12 / sm=14 / md=16 / lg=18 / xl=22 / 2xl=28`.

## Section 2 — Primitive Components

New directory: `src/components/neumorphic/`. All consume tokens from `useTokens()`.

| Component | Purpose | Notes |
|-----------|---------|-------|
| `<Surface>` | Base soft-UI container | Props: `elevation`, `inset`, `radius`. Implements platform-specific sandwich shadow. |
| `<NButton>` | Primary text button | Wraps `Pressable` + `Surface`. Reanimated scale `0.97` + haptic on press. Variants: `primary` / `secondary` / `ghost`. |
| `<NIconButton>` | Circular icon button | Used for FAB, toolbar icons, sync indicator. Sizes: `sm` / `md` / `lg`. |
| `<NInput>` | Text field | `Surface inset` wrapping `TextInput`. Focus = subtle accent border-glow ring. |
| `<NCard>` | Generic raised card | `Surface raised` + padding + `radius lg`. Optionally pressable. |
| `<NGroup>` | Grouped list container | `Surface raised` containing flat rows separated by 1px hairlines (30% alpha shadow). |
| `<NModal>` | Modal dialog | `expo-blur` `BlurView` scrim + centered `Surface floating`. |
| `<NTabBar>` | Bottom navigation | Detached `Surface raised pill` floating above content. Active tab = inset pocket. |
| `<NToggle>` | Switch | Inset pill track + raised circular thumb (Reanimated slide). |
| `<NChip>` | Pill chip | `Surface subtle` for tags / filters. |

Estimated total: ~10 files, ~800–1000 LOC.

## Section 3 — ThemeContext Changes

Extend `src/contexts/ThemeContext.tsx`:

```ts
type Style = 'neumorphic' | 'flat';

interface ThemeContextType {
  theme: ThemeMode;          // existing
  isDark: boolean;
  style: Style;              // NEW
  setTheme: (m: ThemeMode) => void;
  setStyle: (s: Style) => void;  // NEW
  colors: Tokens['colors'];
  tokens: Tokens;            // NEW
}
```

- New AsyncStorage key: `@gitnotes:style`. Default `'neumorphic'`.
- `colors` resolves: `style === 'flat' ? flatPalette[mode] : neumorphicPalette[mode]`.
- Flat palette = existing values preserved verbatim.
- `tokens.elevation` returns empty/zero shadow values when `style === 'flat'`.
- New `useTokens()` shorthand hook.
- All existing `colors.background / surface / text / ...` keys preserved unchanged so legacy code keeps working during migration.

## Section 4 — Screen-by-Screen Mapping

| Screen | Replacement plan |
|--------|------------------|
| HomeScreen | Stat cards → `<NCard>`; recent notes → `<NGroup>`; FAB → `<NIconButton size=lg>`. |
| NotesListScreen | Search → `<NInput>`; filter chips → `<NChip>`; rows → `<NGroup>` per folder; multi-select toolbar → `<Surface floating>` bottom dock. |
| NoteEditorScreen | Header + bottom toolbar → `<Surface raised>` frame; title + body stay flat (readability); tag pills → `<NChip>`; backlinks → `<NGroup>`. |
| TodoListScreen | Sections → `<NGroup>`; rows flat; checkbox redesigned as small `<Surface inset>` with accent check; add bar → `<NInput>` + `<NIconButton>`; progress = inset track + accent fill. |
| CanvasListScreen | Grid items → `<NCard>`. |
| CanvasEditorScreen | Top + bottom toolbars → `<Surface raised>`; tool buttons → `<NIconButton>`, active tool inset; canvas surface stays flat. |
| ExploreScreen | Search → `<NInput>`; repo tree → `<NGroup>`; repo selection → `<NChip>`. |
| SettingsScreen | Sections → `<NGroup>`; toggles → `<NToggle>`; buttons → `<NButton>`; new "UI Style" segmented row. |
| OnboardingScreen | Showcase: per-page centered `<NCard>`; page dots = `<Surface subtle>` circles, active = `inset` accent; CTA = `<NButton variant=primary>`. |
| FileViewerScreen / ImageViewerScreen / PdfViewerScreen / VideoViewerScreen | Content full-bleed flat; header `<Surface raised>` frame; bottom action cluster → `<NIconButton>`s. |

Cross-cutting components (`FolderSelectionDialog`, `MoveNoteDialog`, `GitContextPicker`, `GitHubPicker`, `VoiceInputModal`, `TemplateSelector`, `ContextMenu`) rebuilt on `<NModal>` + internal `<NGroup>` rows + `<NButton>` actions.

`SyncIndicator` → small `<Surface subtle pill>` with accent dot. `StartupSyncGate` → centered `<NCard>` spinner.

`RepoFileBrowser`, `RepoFileTree`, `FolderTreeView` (large nested lists) get extra QA pass; same `<NGroup>`-with-flat-rows pattern.

## Section 5 — Migration Plan

Phased, gated by `useTheme().style`. Each phase mergeable in isolation.

### Phase 0 — Foundations (this PR)

- This design spec
- `src/theme/tokens.ts`
- `ThemeContext` extension (`style` flag + `useTokens`)
- `<Surface>` primitive (cross-platform sandwich shadow)
- Dev-only gallery screen `__dev__/NeumorphicGallery.tsx` (not in nav) for visual smoke testing on iOS/Android/web
- App ships unchanged for end users

### Phase 1 — Primitive set

- `<NButton>`, `<NIconButton>`, `<NInput>`, `<NCard>`, `<NGroup>`, `<NChip>`, `<NToggle>`, `<NModal>`, `<NTabBar>`
- All rendered in gallery
- Settings screen gets the user-facing style toggle

### Phase 2 — Chrome

- `<NTabBar>` swap in `src/navigation/`
- `SettingsScreen` migrated end-to-end
- `OnboardingScreen` migrated (low risk, high showcase value)

### Phase 3 — List-heavy

- `NotesListScreen`
- `TodoListScreen`
- `HomeScreen`
- `ExploreScreen`
- `CanvasListScreen`

### Phase 4 — Editors

- `NoteEditorScreen` (toolbar / header / tags only — body stays flat)
- `CanvasEditorScreen` (toolbar only)
- File / Image / PDF / Video viewers (header + action cluster)

### Phase 5 — Modals + cross-cutting

- All modal-style components rebuilt on `<NModal>`
- `SyncIndicator`, `StartupSyncGate`, `UndoRedoControls`, `TagInput`, `SearchBar`, `FolderBreadcrumb`, `ChecklistProgress`, `InteractiveCheckbox`, `NoteCard`
- `RepoFileBrowser`, `RepoFileTree`, `FolderTreeView` (extra QA)

### Phase 6 — Polish

- Web parity check (CSS `box-shadow` rendering via `react-native-web`)
- Android shadow tuning (sandwich strategy validates without `elevation` color support)
- Accessibility contrast audit
- Default `style: 'neumorphic'` for new installs; existing installs see new default on first launch but can flip back in one tap

### Per-phase QA gate

- `npm run ts:check` clean
- `npm test` passes (snapshots regenerated each phase)
- Manual visual check on iOS simulator + Android emulator + web build

### Rollback

User toggles "Flat" in Settings → entire UI reverts instantly via `style` flag. Same code path doubles as opt-out for users who dislike neumorphism.

## Section 6 — Risks and Open Issues

### R1 — Android shadow color

Android `elevation` prop does not honor color. The sandwich `<Surface>` must rely on absolutely-positioned tinted `View`s with opacity for the colored highlight/shadow effect, not native elevation. iOS uses `shadowColor / Offset / Radius`. Web uses CSS `box-shadow`. Three platform paths inside `<Surface>` — Phase 0 gallery validates all three before any screen migration.

### R2 — Inset shadow simulation

RN has no inset shadow. `<Surface inset>` simulates with 4 absolutely-positioned thin gradient `View`s along the inner edges. Linear, not radial. Acceptable at `sm` and `md` radii. Restricted to inputs, pressed buttons, checkbox squares, and toggle tracks — never applied to large `lg`-radius cards.

### R3 — Long-list performance

`<NGroup>` renders one shadow per container regardless of row count. Fine for 200+ rows. Per-row `<NCard>` use is forbidden for list rows. Enforced by code review.

### R4 — Web shadow blur cost

CSS `box-shadow` with high blur on many elements is repaint-heavy. `floating` tier limited to modals + FAB. Subtle / raised tiers use moderate blur values on web specifically.

### R5 — Periwinkle contrast

`#7B8CDE` on `#E0E5EC` ≈ 3.1:1 — fails WCAG AA for body text but meets the 3:1 minimum for large UI elements / non-text indicators. Accent therefore restricted to icons, active-state highlights, and FAB. Body text uses `#2D3142` on `#E0E5EC` ≈ 11:1.

### R6 — Migration scope

~15k LOC across 13 screens and ~25 components touched. Phased plan keeps each PR reviewable.

### R7 — Existing tests

`__tests__/` snapshots will break across the board during migration. Plan: regenerate snapshots per phase. Behavior assertions must continue to pass unchanged.

### O1 — Reanimated v4 + RN 0.81 + Worklets 0.5

Verify `withSpring` on press-scale works on Android. Stack is current (reanimated reduced-motion warning fix landed in `2e66cb3`). Validate in Phase 0 gallery.

### O2 — Skia usage

`@shopify/react-native-skia` stays reserved for canvas drawing. NOT used for the primitive shadow implementation. Sandwich `View` strategy only.

### O3 — Default for existing users

Default `style: 'neumorphic'` applied to all installs, including existing users on first launch after upgrade. No migration prompt — opt-out toggle is one tap in Settings.
