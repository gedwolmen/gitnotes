<p align="center">
<img width="200" height="200" alt="GitNotēs icon" src="https://github.com/user-attachments/assets/776e9654-0117-44c5-a85e-5a72e7f4ac9f" />
</p>

<h1 align="center">GitNotēs</h1>

<p align="center">
A mobile notes, todos, and canvas app that uses GitHub repositories as durable, versioned storage. Built with Expo and React Native.
</p>

---

## Overview

GitNotēs treats your notes as plain files in a Git repository: every note, todo, and canvas is a real Markdown / Neorg / Org / JSON file you can read, edit, and share outside the app. Notes are kept in sync with GitHub, edits are queued and retried when offline, and everything renders locally with native gestures, haptics, and a neumorphic UI.

## Features

### Content types

- Markdown notes with live preview, code-fence rendering, and editor toolbar (undo/redo, headings, lists, code).
- Neorg notes with a custom parser (block, inline, link, table parsers) and dedicated rendering.
- Org-mode notes.
- Todos with checkboxes, due dates, and per-repo sync.
- Canvas drawings with pinch-zoom, two-finger pan, and JSON-backed scenes.
- Templates for quickly creating structured notes.
- **GitNotes AI** chat with notes / todos as tools, contexts attached from your repo, threads versioned in GitHub. See [`docs/ai-chat.md`](docs/ai-chat.md).

### GitNotes AI

- Multi-provider: Apple Foundation Models (on-device, iOS), Llama via `@react-native-ai/llama` (SmolLM3-3B), and any OpenAI-compatible endpoint (OpenAI, Z.AI Coding Plan, local Ollama, etc.).
- Tool calling: `create_note`, `edit_note`, `search_notes`, `create_todo`, etc., with optional confirm-before-apply mode.
- Context picker: attach files / folders / whole repos / local notes / local todos to a message; contexts persist across turns in a thread.
- Token-budget warnings tuned per model (4K hard limit on Apple, 64K on SmolLM3).
- Streaming with Stop button, edit-and-resend, regenerate, auto-titled threads.
- Per-provider quirks isolated in [`src/services/ai/providerQuirks.ts`](src/services/ai/providerQuirks.ts) so divergences (e.g. Z.AI's `tool_stream`) don't leak into the chat code.
- Threads stored as JSON files under `chat/` in your selected repo, retried on 409 conflicts.

### GitHub sync

- Pull notes, todos, and canvases from any linked repository, with safe merge that won't clobber unsynced local edits.
- Push edits with conflict-aware uploads (retries on 409, skips on 422 already-exists).
- Offline sync queue: failed mutations persist to disk and drain on reconnect.
- True deletes: removing a note also deletes the remote file so the next pull won't resurrect it.
- Image upload: local images embedded in notes are uploaded to `notes/images/<slug>/` on first sync and rewritten to raw URLs.
- Lists private repos and collaborator repos with paginated fetch.
- Personal Access Token auth, token stored in secure storage.

### File browser and tree

- Repository file tree with expandable folders and lazy-loaded children.
- Rename, move, and delete files or whole directories with recursive operations.
- File viewer for Markdown, images (zoomable), PDFs, and videos.
- Long-press context menu for file operations and details.

### Organization and search

- Folder filter chips, scoped to the active repository.
- Multi-field search across title, content, and tags.
- Pinned notes float to the top.
- Per-screen search bar with match navigation.

### UI and design system

- Neumorphic primitives in `src/components/ui/`: `Surface`, `Group`/`GroupRow`, `Button`, `IconButton`, `Card`, `Chip`, `Input`, `Modal`, `Toggle`, `ScreenHeader`, `TabBar`.
- Token-based theming via `useTokens` and `useTheme`: colors, spacing, type scale, elevation.
- Three theme modes: automatic, light, dark, with full coverage across modals, pickers, markdown renderers, and the file tree.
- Floating tab bar pill with haptic selection.
- Cross-platform soft shadows (iOS + Android).

### State and data

- Zustand stores for notes, todos, canvases, folders, and repos, keeping screens lean and selectors cheap.
- TanStack Query for GitHub API calls, with caching and background refetch.
- AsyncStorage with per-note keys (no whole-blob writes), plus an automatic migration from the legacy single-blob format.
- Position memory: scroll position and last-opened state restored across sessions.

### Reliability

- Strict TypeScript across the app.
- Comprehensive error states and loading indicators on async ops.
- Defensive parsing for Neorg and Org documents.
- Atomic per-note storage: a corrupt entry can't take down the whole index.

### Platform

- Onboarding flow with GitHub authentication.
- Share intent support for incoming text and images.
- Local notifications.
- Haptic feedback on key interactions.
- iOS and Android, single codebase.

## Getting started

### Prerequisites

- Node.js >= 20.18
- Yarn 1.x (classic)
- Expo CLI
- iOS Simulator or Android Emulator (or Expo Go on a physical device)

### Install and run

```bash
yarn install
yarn start
```

Then:

- Press `i` to launch the iOS Simulator.
- Press `a` to launch the Android Emulator.
- Or scan the QR code with Expo Go on a physical device.

## Project structure

```
gitnotes/
├── App.tsx
├── app.json
├── eas.json
├── src/
│   ├── components/
│   │   └── ui/              # Neumorphic primitives
│   ├── contexts/            # Theme, auth, view mode, etc.
│   ├── hooks/               # TanStack Query hooks, useMarkdown, etc.
│   ├── models/              # Note, Todo, Canvas, Folder, Repository
│   ├── navigation/          # React Navigation stacks and types
│   ├── screens/             # Top-level screens (Notes, Todos, Canvases, Explore, Settings, ...)
│   ├── services/            # GitHub, storage, sync queue, parsers, notifications
│   ├── stores/              # Zustand stores
│   ├── theme/               # Tokens, elevation builder
│   └── utils/               # gitPathParser, viewModes, haptics, ...
└── assets/
```

## Design system

The UI is built on a small set of neumorphic primitives that share a single token system.

- `Surface` is the base soft-shadow container; everything else composes it.
- `Group` and `GroupRow` produce iOS-style settings lists with leading/trailing slots.
- `ScreenHeader` and `SearchBar` give every tab the same shape.
- `IconButton` supports `default`, `primary`, and `ghost` variants for chrome that disappears into the row.
- A dev-only neumorphic gallery exists for visual smoke testing.

## Tech stack

- Expo SDK 55
- React Native 0.83
- TypeScript 5.6
- React Navigation v7
- TanStack Query v5
- Zustand v5
- Vercel AI SDK v5 with `@ai-sdk/openai-compatible` v1 and `@react-native-ai/{apple,llama}` for the chat layer
- `react-native-marked` for Markdown rendering
- `@shopify/flash-list` for virtualized lists
- `react-native-reanimated` and `react-native-gesture-handler` for animations and gestures

## Security

- The project pins `markdown-it` to v14.1.1 via npm overrides to address GHSA-6vfc-qv3f-vr6c.
- GitHub Personal Access Tokens and AI provider API keys are stored in `expo-secure-store` (Keychain on iOS, EncryptedSharedPreferences on Android), never in plain `AsyncStorage`. Legacy AsyncStorage tokens migrate on first read.
- AI provider configuration validates base URLs and prompts a confirmation before saving any non-https endpoint, since the API key would travel in plain text.
- Open advisories tracked in issues; see `#222` for upstream Expo bumps for `postcss` and `uuid` CVEs.

## Deployment

The repository ships with an `eas.json` containing three build profiles:

- `development` — for testing during development.
- `preview` — for internal distribution.
- `production` — for App Store and Play Store submission.

### Build

```bash
eas login
eas build:configure

eas build --platform ios --profile production
eas build --platform android --profile production
```

### Submit

```bash
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

Android submission requires a `google-service-account.json` at the repo root (gitignored, path referenced from `eas.json`). See the [EAS Submit docs](https://docs.expo.dev/submit/android/#creating-a-service-account) for how to create one.

## Development scripts

```bash
yarn start       # Expo dev server
yarn ts:check    # TypeScript type checking
yarn test        # Jest unit tests (where present)
```

## Contributing

The project follows an atomic-commit workflow: each commit is a single focused change with a descriptive message. Pull requests are reviewed against the same standard.

## License

MIT
