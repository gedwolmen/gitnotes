# Architecture

> GitNotēs project structure and key modules.

## Overview

GitNotēs is a React Native (Expo) note-taking app with **Git sync** (isomorphic-git), **AI assistance** (Vercel AI SDK), and **offline-first design** (AsyncStorage).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 56, React Native 0.85 |
| Language | TypeScript 6 (strict mode) |
| State | Zustand (stores), React Context |
| Styling | NativeWind v5 (Tailwind) |
| Navigation | React Navigation v7 |
| Git | isomorphic-git |
| AI | Vercel AI SDK v6 |
| Storage | AsyncStorage, expo-secure-store |
| i18n | i18next (6 languages) |
| Animations | Reanimated 4 |
| Testing | Jest, React Native Testing Library |

## Key Modules

### `src/services/`

Business logic layer:

- `DailyQuoteService.ts` — Philosopher quote generation with AI personalization
- `AIService.ts` — Vercel AI SDK integration
- `GitService.ts` — Git clone, commit, push, pull via isomorphic-git
- `NoteService.ts` — Note CRUD and parsing
- `JournalService.ts` — Journal entry management
- `TodoService.ts` — Todo item management

### `src/stores/`

Zustand stores:

- `aiStore.ts` — AI settings (providers, personalization toggle)
- `noteStore.ts` — Active note state
- `gitStore.ts` — Git repository state
- `syncStore.ts` — Sync status and queue
- `themeStore.ts` — Theme mode (light/dark/system)

### `src/hooks/`

Custom hooks:

- `useDailyQuote.ts` — Daily quote with cache and refresh
- `useNote.ts` — Note operations
- `useAI.ts` — AI chat and generation
- `useGit.ts` — Git operations wrapper
- `useSync.ts` — Sync status and progress
- `useTheme.ts` — Theme access

### `src/contexts/`

React contexts:

- `ThemeContext.tsx` — Theme colors, mode, tokens
- `NoteContext.tsx` — Active note, unsaved changes
- `SyncContext.tsx` — Sync status provider

### `src/screens/`

Screen components:

- `HomeScreen.tsx` — Note list with filters and search
- `NoteEditorScreen.tsx` — Rich text editor
- `SettingsScreen.tsx` — App settings and AI config
- `GitSyncScreen.tsx` — Git repository management
- `AIScreen.tsx` — AI chat interface

## Data Flow

### Note Creation

```
User types in editor
  → NoteEditorScreen state
  → NoteContext.updateNote()
  → NoteService.save() [AsyncStorage]
  → SyncService.queueChange() [sync queue]
  → GitService.commit() [isomorphic-git]
  → GitService.push() [if online]
```

### AI Chat

```
User sends message
  → AIScreen state
  → AIService.chat(messages)
  → Vercel AI SDK (streamText)
  → Token budget check (modelLimits.ts)
  → Provider selection (AIProviderType)
  → Stream response to UI
```

### Daily Quote

```
HomeScreen mounts
  → useDailyQuote() hook
  → Check cache (cacheKey + Date.now())
  → If stale: DailyQuoteService.fetchQuote()
    → Check aiPersonalizationEnabled
    → If disabled: return generic quote
    → If enabled: generate with AI (journals context)
  → Update cache (AsyncStorage)
  → Render DailyQuoteCard
```

## State Management

| Store | Purpose | Persistence |
|-------|---------|-------------|
| `aiStore` | AI settings | AsyncStorage + SecureStore (API keys) |
| `noteStore` | Active note | AsyncStorage |
| `gitStore` | Git repo state | AsyncStorage |
| `syncStore` | Sync queue | AsyncStorage |
| `themeStore` | Theme mode | AsyncStorage |
| `settingsStore` | App settings | AsyncStorage |

## Offline Strategy

1. **Write to AsyncStorage first** (fast, reliable)
2. **Queue changes in syncStore** (change type + data)
3. **Git commit locally** (isomorphic-git on device)
4. **Push when online** (syncService checks NetInfo)
5. **Pull on app focus** (fetch remote changes)
