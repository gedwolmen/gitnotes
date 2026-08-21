# Settings Keyboard & Quote Grouping Fix

Fixes iOS keyboard coverage of text inputs in Settings/AI screens and groups all Daily Quote settings together.

## Problem

- **Keyboard coverage:** On iOS, text inputs near the bottom of the screen were covered by the software keyboard in the Settings tab and the AI section.
  - `ModelSelector` (bottom-sheet modal) had no `KeyboardAvoidingView`, so its search box could be obscured.
  - `RenderStyleEditorScreen` hex-color inputs sat in a plain `ScrollView` with no keyboard handling.
  - `ChatScreen`'s message list did not persist taps while the keyboard was open.
- **Scattered quote settings:** In Settings → Artificial Intelligence, the three Daily Quote rows (enable, personalization, show sources) were interleaved with non-quote rows (Enable AI, AI Personalization, GitHub Tools), making quote options hard to find.

## Changes

| File | Change |
|------|--------|
| `src/components/ai/ModelSelector.tsx` | Wrapped the bottom-sheet overlay in `KeyboardAvoidingView` (`behavior="padding"` on iOS), matching the existing `ProviderConfigModal` pattern. Sheet now rises above the keyboard. |
| `src/screens/RenderStyleEditorScreen.tsx` | Added `keyboardShouldPersistTaps="handled"` + `automaticallyAdjustKeyboardInsets` to the main `ScrollView` so hex-color inputs scroll above the keyboard. |
| `src/screens/ChatScreen.tsx` | Added `keyboardShouldPersistTaps="handled"` to the message `FlatList` so taps register while the keyboard is open. |
| `src/components/settings/SettingsContent.tsx` | Extracted the three Daily Quote rows into a dedicated **Daily Quote** group (title from `settings.dailyQuote.title`) placed directly after the Artificial Intelligence group. All `testID`s, toggles, pro-gating, and disabled logic preserved verbatim. |

## Behavior after fix

- **ModelSelector:** search field and model list stay visible when the keyboard opens.
- **RenderStyleEditorScreen:** hex inputs are scrollable into view above the keyboard.
- **ChatScreen:** tapping messages / hint chips works while the keyboard is open.
- **Settings:** quote options live together under their own "Daily Quote" group header for ease of access; AI group retains Enable AI, AI Personalization, GitHub Tools.

## No data/model changes

Quote settings remain persisted in the `ai-settings` AsyncStorage blob — no migration needed. All row `testID`s unchanged, so the pro-gate test suite (`SettingsContent.pro-gate.test.tsx`) passes without edits.

## Testing

```bash
yarn ts:check
yarn jest __tests__/components/settings/SettingsContent.pro-gate.test.tsx --no-coverage --forceExit
yarn jest __tests__/ModelSelector.search.test.tsx --no-coverage --forceExit
yarn eslint src/components/ai/ModelSelector.tsx src/screens/RenderStyleEditorScreen.tsx src/screens/ChatScreen.tsx src/components/settings/SettingsContent.tsx
```
