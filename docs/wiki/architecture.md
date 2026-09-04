# Architecture

> GitNotēs project structure and key modules.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 56, React Native 0.85 |
| Language | TypeScript 6 (strict mode) |
| State | Zustand (stores), React Context |
| Styling | NativeWind v5 (Tailwind) |
| Navigation | React Navigation v7 |
| Git | git2 (native) |
| AI | Vercel AI SDK v6 |
| Storage | AsyncStorage, expo-secure-store |
| i18n | i18next (EN, ES, FR, DE, JA, KO) |
| Animations | Reanimated 4 |

## Key Modules

### src/services/
Business logic — `git/` (clone/push/pull), `ai/` (providers), `canvas/` (sparse-tile), `conflict/` (3-way merge).

### src/stores/
Zustand stores — `noteStore`, `todoStore`, `canvasStore`, `chatStore`, `repoStore`, `aiStore`, `proStore`, `themeStore`.

### src/screens/
Screens — Home, Notes, NoteEditor, Todo, Canvas, Chat, Settings, Onboarding, ConflictResolver, Explore.

## See Also

- [Setup](./setup.md)
- [Development Guide](./development-guide.md)
- [Home](./index.md)
