# AI Chat Feature - Issues

- `yarn ts:check` is currently blocked by pre-existing `src/screens/ChatThreadListScreen.tsx` type errors (wrong ChatStorageService import, outdated prop names/navigation route names, and invalid JSX/FlashList prop usage), unrelated to the `SettingsScreen` AI section change.

- 2026-05-02 plan-compliance audit rejected the branch: `ChatScreen.tsx` still imports `useNoteStore`/`useTodoStore` directly, `ContextPickerModal.tsx` only shows placeholders for Files/Folders instead of real pickers, and AI offline auto-fallback is not implemented in `AIService.ts` or `ChatScreen.tsx`.
- 2026-05-02 audit also found persistence gaps: `FloatingAIButton.tsx` uses `useNavigation()` while rendered outside `NavigationContainer`, and `ChatThreadListScreen.tsx` renames threads locally without persisting them back through `ChatStorageService`.
