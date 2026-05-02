# GitNotes AI Chat Feature

## TL;DR

> **Quick Summary**: Add a floating draggable AI button to GitNotes that opens "GitNotes Chat" — a full AI chat experience where users can create/edit/update notes and todos through conversation, ask questions about their content, and select files/folders/repos as context. Supports on-device AI (Apple Foundation Models + Llama GGUF) and any cloud model via OpenAI-compatible API.
>
> **Deliverables**:
> - Floating draggable AI button visible on all screens
> - Full chat UI ("GitNotes Chat") with streaming, threads, and context
> - AI-powered note/todo CRUD through chat (with auto-execute or confirm mode)
> - Context picker for files, folders, and repos
> - Settings section: AI enable/disable, model selection, API key management, action mode toggle
> - Chat thread persistence to user's GitHub repo
> - First-use flow to select chat storage repo
> - Offline auto-fallback to on-device models
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 6 waves
> **Critical Path**: Task 2 (types) → Task 6 (AI service) → Task 9 (AI tools) → Task 16 (Chat screen) → Task 19 (Integration)

---

## Context

### Original Request
User wants a floating AI button that users can drag around. Clicking it opens "GitNotes Chat" where users can create, edit, and update notes and todos, ask questions about them, and select file/folder/repo as context. Uses `callstackincubator/ai` for on-device models (local should be default) and `@ai-sdk/openai-compatible` for cloud models. Settings should allow model selection and API key entry; adding an API key should update available models.

### Interview Summary
**Key Discussions**:
- **Platform**: iOS + Android. Apple Foundation Models on iOS 26+, Llama GGUF on Android.
- **AI Actions**: Both auto-execute and confirm-before-execute modes (user toggle in settings).
- **Chat Persistence**: Multiple named threads saved to user's GitHub repo (not local-only). First-use prompt to pick storage repo.
- **Cloud Providers**: Fully custom — user adds name + baseURL + API key for any OpenAI-compatible endpoint.
- **Button**: Visible on ALL screens, draggable with position memory.
- **Context**: Attach button in chat input bar opens modal picker for file/folder/repo.
- **Offline**: Auto-fallback to on-device models when no network.
- **Disable AI**: Master toggle in settings hides all AI features.
- **Tests**: After implementation, using existing Jest + React Testing Library setup.

**Research Findings**:
- `callstackincubator/ai` (v0.12+) is compatible with Vercel AI SDK v6. Provides `apple()` and `llama.languageModel()` model factories that work with `generateText`/`streamText` from the `ai` package.
- `@ai-sdk/openai-compatible` provides `createOpenAICompatible({ name, baseURL, apiKey })` returning `.chatModel(modelId)`.
- Apple provider requires iOS 26+ for text generation, iOS 17+ for embeddings. Built-in, no downloads.
- Llama provider requires GGUF model download from HuggingFace. Works iOS + Android.
- GitNotes uses neumorphic UI primitives (Surface, Button, Group, Toggle), Zustand stores, React Navigation v7, TanStack Query, AsyncStorage + expo-secure-store.
- No existing AI/chat code in the codebase.

### Gap Analysis (self-review)
**Identified Gaps** (addressed):
- Apple provider only works on physical iOS 26+ devices, not simulator — plan includes graceful fallback UI.
- Llama models require download — plan includes download progress UI and storage management.
- Chat storage to repo needs a defined file format — plan specifies JSON files in `.gitnotes/chats/` directory.
- API keys need secure storage — plan uses `expo-secure-store` matching existing pattern for GitHub tokens.
- AI tool calls for note/todo CRUD need to handle the "confirm" mode — plan includes confirmation dialog UI.

---

## Work Objectives

### Core Objective
Integrate a complete AI chat experience into GitNotes that lets users interact with their notes and todos through natural language, powered by on-device and cloud AI models.

### Concrete Deliverables
- `src/models/Chat.ts` — Chat thread and message type definitions
- `src/models/AIProvider.ts` — AI provider configuration types
- `src/stores/aiStore.ts` — AI settings, providers, API keys, model selection
- `src/stores/chatStore.ts` — Chat threads, messages, active thread state
- `src/services/AIService.ts` — Unified AI interface (on-device + cloud)
- `src/services/ChatStorageService.ts` — Persist/load chat threads to/from GitHub repo
- `src/services/ContextService.ts` — Gather file/folder/repo content as AI context
- `src/services/ai/tools.ts` — AI tool definitions for note/todo CRUD
- `src/services/ai/systemPrompt.ts` — System prompt builder with context injection
- `src/services/ai/actionExecutor.ts` — Execute AI tool calls against stores
- `src/components/ai/FloatingAIButton.tsx` — Draggable floating button
- `src/components/ai/ChatMessageBubble.tsx` — Message bubble (user/assistant/system)
- `src/components/ai/ChatInputBar.tsx` — Input bar with attach and send
- `src/components/ai/ContextPickerModal.tsx` — File/folder/repo context picker
- `src/components/ai/ProviderConfigModal.tsx` — Add/edit custom provider
- `src/components/ai/ChatRepoPickerModal.tsx` — First-use repo picker
- `src/screens/ChatScreen.tsx` — Full chat screen with streaming
- `src/screens/ChatThreadListScreen.tsx` — Thread list and management
- Updated `src/navigation/types.ts` — New chat route types
- Updated `src/navigation/AppNavigator.tsx` — Chat routes + floating button
- Updated `src/screens/SettingsScreen.tsx` — AI settings section

### Definition of Done
- [ ] Floating AI button appears on all screens, draggable, persists position
- [ ] Clicking button navigates to "GitNotes Chat" thread list
- [ ] User can create new chat threads, rename, delete
- [ ] Chat sends messages to AI and streams responses
- [ ] AI can create, edit, update notes and todos through tool calls
- [ ] Confirm mode shows proposed changes before applying
- [ ] Attach button opens context picker for file/folder/repo
- [ ] First-use flow prompts user to select chat storage repo
- [ ] Chat threads persist to selected GitHub repo
- [ ] Settings has AI disable toggle that hides all AI features
- [ ] Settings has model selection (on-device + cloud providers)
- [ ] Settings allows adding custom OpenAI-compatible providers with name + baseURL + API key
- [ ] Adding API key updates available models list
- [ ] Offline auto-fallback to on-device models
- [ ] `yarn ts:check` passes with no errors
- [ ] `yarn test` passes

### Must Have
- Floating AI button on all screens, draggable
- Chat UI with streaming responses
- AI tool calls for note/todo CRUD (create, edit, update, delete)
- Context selection (file, folder, repo)
- Chat thread persistence to GitHub repo
- First-use repo picker for chat storage
- Settings: disable AI toggle
- Settings: model selection (on-device + cloud)
- Settings: API key management for custom providers
- Both auto-execute and confirm modes (setting toggle)
- Offline auto-fallback to on-device models
- Neumorphic UI matching existing design system

### Must NOT Have (Guardrails)
- NO separate backend server — all AI runs on-device or calls cloud APIs directly
- NO RAG/embeddings system — context is passed directly in messages
- NO image generation, voice, or transcription AI features
- NO modification of existing note/todo storage format
- NO changes to existing sync or auth flows
- NO third-party chat UI libraries — use existing neumorphic primitives
- NO hardcoded model lists — models discovered dynamically from providers
- AI must NOT delete data without user confirmation in confirm mode
- Floating button must NOT block navigation or tab bar interaction
- AI settings must NOT be accessible when AI is disabled (except the enable toggle)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: YES (Tests after implementation)
- **Framework**: Jest + React Testing Library
- **Test location**: `__tests__/` directory mirroring source structure

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **UI Components**: Use interactive_bash (Expo + simulator) — render, interact, validate
- **Services/Stores**: Use Bash (Jest) — import, call functions, assert state
- **Integration**: Use interactive_bash — navigate through app, test full flows

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - Foundation + Types):
├── Task 1: Install AI dependencies + polyfills [quick]
├── Task 2: Type definitions (Chat, AIProvider) [quick]
├── Task 3: Navigation types update [quick]
├── Task 4: AI Store (settings, providers, keys, models) [unspecified-high]
└── Task 5: Chat Store (threads, messages, CRUD) [unspecified-high]

Wave 2 (After Wave 1 - Core Services):
├── Task 6: AI Service (unified on-device + cloud) (depends: 1, 2, 4) [deep]
├── Task 7: Chat Storage Service (depends: 2, 5) [unspecified-high]
└── Task 8: Context Service (depends: 2) [unspecified-high]

Wave 3 (After Wave 2 - AI Logic):
├── Task 9: AI Tools + System Prompt (depends: 6, 8) [deep]
└── Task 10: AI Action Executor (depends: 9) [deep]

Wave 4 (After Wave 1+2 - UI Components, MAX PARALLEL):
├── Task 11: Floating AI Button (depends: 4) [visual-engineering]
├── Task 12: Chat Message Bubble + Input Bar (depends: 2) [visual-engineering]
├── Task 13: Context Picker Modal (depends: 8) [visual-engineering]
├── Task 14: Provider Config Modal + Model Selector (depends: 4) [visual-engineering]
└── Task 15: Chat Repo Picker Modal (depends: 7) [visual-engineering]

Wave 5 (After Wave 3+4 - Screens + Settings):
├── Task 16: Chat Screen (depends: 9, 10, 12, 13) [unspecified-high]
├── Task 17: Chat Thread List Screen (depends: 5, 7) [visual-engineering]
└── Task 18: Settings AI Section (depends: 4, 14, 15) [unspecified-high]

Wave 6 (After Wave 5 - Integration):
└── Task 19: App Navigator Integration (depends: 11, 16, 17) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real manual QA [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: Task 2 → Task 6 → Task 9 → Task 16 → Task 19 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 5 (Waves 1 & 4)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | - | 6 | 1 |
| 2 | - | 5, 6, 7, 8, 12 | 1 |
| 3 | - | 19 | 1 |
| 4 | - | 6, 11, 14, 18 | 1 |
| 5 | 2 | 7, 17 | 1 |
| 6 | 1, 2, 4 | 9, 10 | 2 |
| 7 | 2, 5 | 15, 17 | 2 |
| 8 | 2 | 9, 13 | 2 |
| 9 | 6, 8 | 10, 16 | 3 |
| 10 | 9 | 16 | 3 |
| 11 | 4 | 19 | 4 |
| 12 | 2 | 16 | 4 |
| 13 | 8 | 16 | 4 |
| 14 | 4 | 18 | 4 |
| 15 | 7 | 18 | 4 |
| 16 | 9, 10, 12, 13 | 19 | 5 |
| 17 | 5, 7 | 19 | 5 |
| 18 | 4, 14, 15 | - | 5 |
| 19 | 3, 11, 16, 17 | F1-F4 | 6 |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks — T1 → `quick`, T2-T3 → `quick`, T4-T5 → `unspecified-high`
- **Wave 2**: 3 tasks — T6 → `deep`, T7-T8 → `unspecified-high`
- **Wave 3**: 2 tasks — T9-T10 → `deep`
- **Wave 4**: 5 tasks — T11-T15 → `visual-engineering`
- **Wave 5**: 3 tasks — T16, T18 → `unspecified-high`, T17 → `visual-engineering`
- **Wave 6**: 1 task — T19 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Install AI Dependencies + Polyfills

  **What to do**:
  - Install `ai` (Vercel AI SDK v5 — required for compatibility with callstackincubator/ai <=0.11, see their README: "0.11 and below → v5")
  - Install `@react-native-ai/apple` for on-device Apple Foundation Models
  - Install `@react-native-ai/llama` for on-device Llama GGUF models (Android + iOS)
  - Install `@ai-sdk/openai-compatible` for custom cloud providers
  - Install `llama.rn` (peer dependency of `@react-native-ai/llama`)
  - Install `react-native-blob-util` (peer dependency for Llama model downloads)
  - If the callstackincubator/ai README mentions required polyfills for Vercel AI SDK in React Native, install those too (check `react-native-ai.dev/docs/polyfills`)
  - Run `yarn install` and verify no peer dependency warnings
  - Verify `yarn ts:check` still passes

  **Must NOT do**:
  - Do NOT install `@ai-sdk/openai` (we use the openai-compatible provider, not the official OpenAI provider)
  - Do NOT install `@react-native-ai/mlc` (not in scope)
  - Do NOT modify any existing source files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Task 6 (AIService needs packages installed)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `package.json` — Current dependency structure and package manager (yarn@1.22.22)

  **External References**:
  - callstackincubator/ai README: `https://github.com/callstackincubator/ai` — See "Available Providers" section for exact package names and peer dependencies
  - Polyfills: `https://react-native-ai.dev/docs/polyfills` — Required polyfills for Vercel AI SDK in React Native

  **WHY Each Reference Matters**:
  - `package.json` — Must follow exact dependency format and version conventions used in project
  - callstackincubator/ai README — Contains exact installation commands and peer dependency requirements
  - Polyfills docs — Vercel AI SDK requires specific polyfills to work in React Native (streaming, TextEncoder, etc.)

  **Acceptance Criteria**:
  - [ ] All packages installed without errors: `ai`, `@react-native-ai/apple`, `@react-native-ai/llama`, `@ai-sdk/openai-compatible`, `llama.rn`, `react-native-blob-util`
  - [ ] `yarn install` completes with no peer dependency errors
  - [ ] `yarn ts:check` passes (no new type errors from new packages)

  **QA Scenarios**:
  ```
  Scenario: Dependencies install cleanly
    Tool: Bash
    Preconditions: Clean node_modules state
    Steps:
      1. Run `yarn install`
      2. Check exit code is 0
      3. Run `cat package.json | grep -E '"ai"|"@react-native-ai"|"@ai-sdk"'`
    Expected Result: All 4 packages listed in dependencies with correct names
    Failure Indicators: Missing packages, peer dependency warnings, exit code non-zero
    Evidence: .sisyphus/evidence/task-1-install.txt

  Scenario: TypeScript still compiles after adding deps
    Tool: Bash
    Preconditions: Packages installed
    Steps:
      1. Run `yarn ts:check`
    Expected Result: Exit code 0, no new type errors
    Failure Indicators: Type errors from newly installed packages
    Evidence: .sisyphus/evidence/task-1-tscheck.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `feat(ai): add AI dependencies, type definitions, and navigation types`
  - Files: `package.json`, `yarn.lock`

- [x] 2. Type Definitions (Chat, AIProvider)

  **What to do**:
  - Create `src/models/Chat.ts` with types:
    - `ChatMessage`: `{ id, role: 'user' | 'assistant' | 'system', content: string, timestamp: number, toolCallId?: string, toolCallName?: string, toolCallArgs?: Record<string, unknown>, toolCallResult?: string, attachedContexts?: AIContext[] }`
    - `ChatThread`: `{ id, title, messages: ChatMessage[], createdAt: number, updatedAt: number, repoOwner: string, repoName: string, branch: string, filePath: string }`
    - `ChatThreadSummary`: lightweight type for thread list (id, title, updatedAt, messageCount)
  - Create `src/models/AIProvider.ts` with types:
    - `AIProviderType`: `'apple' | 'llama' | 'openai-compatible'`
    - `AIProviderConfig`: `{ id, type: AIProviderType, name: string, baseURL?: string, apiKey?: string, isEnabled: boolean, models: AIModelConfig[], addedAt: number }`
    - `AIModelConfig`: `{ id: string, name: string, providerId: string, providerType: AIProviderType, requiresDownload: boolean, downloadSize?: string, isDownloaded?: boolean }`
    - `AIActionMode`: `'auto' | 'confirm'`
    - `AISettings`: `{ isEnabled: boolean, selectedModelId: string | null, actionMode: AIActionMode, chatRepoOwner: string | null, chatRepoName: string | null, chatRepoBranch: string, providers: AIProviderConfig[] }`
    - `AIContextItem`: `{ type: 'file' | 'folder' | 'repo', owner: string, repo: string, path: string, name: string }`
  - Export all types from both files
  - Follow existing model patterns in `src/models/Note.ts` and `src/models/Todo.ts` (named exports, plain interfaces, helper functions at bottom)

  **Must NOT do**:
  - Do NOT import from any AI SDK packages in model files (pure type definitions only)
  - Do NOT create store or service logic here

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Tasks 5, 6, 7, 8, 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/models/Note.ts:1-61` — Type definition pattern: plain interfaces with Optional fields, CreateInput/UpdateInput pattern, named exports
  - `src/models/Todo.ts:1-62` — Same pattern for Todo types: TodoPriority union type, TodoGitHubLink, CreateInput/UpdateInput

  **WHY Each Reference Matters**:
  - `Note.ts` and `Todo.ts` are the canonical patterns for model definitions in this project. New models MUST follow the same structure: plain TypeScript interfaces at top, helper functions at bottom, consistent naming (CreateInput/UpdateInput).

  **Acceptance Criteria**:
  - [ ] `src/models/Chat.ts` exists with ChatMessage, ChatThread, ChatThreadSummary types
  - [ ] `src/models/AIProvider.ts` exists with AIProviderType, AIProviderConfig, AIModelConfig, AIActionMode, AISettings, AIContextItem types
  - [ ] All types are named exports (no default exports)
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Type files compile correctly
    Tool: Bash
    Preconditions: Task 1 completed (packages installed)
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No type errors in new model files
    Failure Indicators: Missing imports, circular deps, type errors
    Evidence: .sisyphus/evidence/task-2-tscheck.txt

  Scenario: Models follow existing patterns
    Tool: Bash
    Preconditions: Files created
    Steps:
      1. Run `grep -c "export interface" src/models/Chat.ts src/models/AIProvider.ts`
      2. Run `grep "export type" src/models/Chat.ts src/models/AIProvider.ts`
    Expected Result: Multiple exported interfaces and type aliases found, no default exports
    Failure Indicators: Missing exports, default exports, import from ai SDK
    Evidence: .sisyphus/evidence/task-2-patterns.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3)
  - Message: `feat(ai): add AI dependencies, type definitions, and navigation types`
  - Files: `src/models/Chat.ts`, `src/models/AIProvider.ts`

- [x] 3. Update Navigation Types

  **What to do**:
  - In `src/navigation/types.ts`, add to `ProductionStackParamList`:
    - `ChatThreadList: undefined` — thread list screen
    - `ChatScreen: { threadId: string }` — individual chat thread
  - Update `RootStackParamList` type accordingly
  - No changes to `BottomTabParamList` (chat is accessed via floating button, not a tab)

  **Must NOT do**:
  - Do NOT modify existing route types
  - Do NOT add a new tab for chat

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 19
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/navigation/types.ts:1-25` — Current route type definitions: ProductionStackParamList, DevOnlyStackParamList, RootStackParamList, BottomTabParamList

  **WHY Each Reference Matters**:
  - This file defines the contract for all navigation in the app. New routes MUST follow the exact same pattern: typed params in ProductionStackParamList, merged into RootStackParamList.

  **Acceptance Criteria**:
  - [ ] `ChatThreadList` route added to ProductionStackParamList with `undefined` params
  - [ ] `ChatScreen` route added with `{ threadId: string }` params
  - [ ] No existing routes modified
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Navigation types compile
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-3-tscheck.txt

  Scenario: New routes exist in types
    Tool: Bash
    Steps:
      1. Run `grep "ChatThreadList\|ChatScreen" src/navigation/types.ts`
    Expected Result: Both ChatThreadList and ChatScreen found in types
    Evidence: .sisyphus/evidence/task-3-routes.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2)
  - Message: `feat(ai): add AI dependencies, type definitions, and navigation types`
  - Files: `src/navigation/types.ts`

- [x] 4. AI Store (Settings, Providers, Models, Disable Toggle)

  **What to do**:
  - Create `src/stores/aiStore.ts` using Zustand (matching pattern from `src/stores/noteStore.ts`)
  - State shape: follows `AISettings` type from `src/models/AIProvider.ts`
    - `isEnabled: boolean` (master AI toggle, default `true`)
    - `selectedModelId: string | null`
    - `actionMode: 'auto' | 'confirm'`
    - `chatRepoOwner: string | null`
    - `chatRepoName: string | null`
    - `chatRepoBranch: string` (default `'main'`)
    - `providers: AIProviderConfig[]` (built-in providers + user-added)
  - Actions:
    - `loadSettings()` — load from AsyncStorage, initialize default providers (Apple, Llama)
    - `toggleAI()` — enable/disable master toggle
    - `setActionMode(mode: AIActionMode)` — switch between auto and confirm
    - `selectModel(modelId: string)` — set active model
    - `addProvider(config: AIProviderConfig)` — add custom OpenAI-compatible provider
    - `updateProvider(id: string, updates: Partial<AIProviderConfig>)` — edit provider (API key, name, baseURL)
    - `removeProvider(id: string)` — delete custom provider
    - `setChatRepo(owner: string, name: string, branch: string)` — set chat storage repo
    - `getAvailableModels()` — derived getter returning all enabled models from all providers
    - `getSelectedModel()` — derived getter returning the currently selected model config
    - `persistSettings()` — save current settings to AsyncStorage
  - Initialize default providers:
    - Apple provider (type: 'apple', id: 'apple-default', name: 'Apple Intelligence', isEnabled: true, models: [{ id: 'apple-foundation', name: 'Foundation Model', ... }]). Note: only available on iOS 26+ physical devices.
    - Llama provider (type: 'llama', id: 'llama-default', name: 'Llama (On-Device)', isEnabled: true, models: [{ id: 'llama-smol', name: 'SmolLM3 3B', requiresDownload: true, downloadSize: '~2GB' }])
  - Persist all settings to AsyncStorage using key `'ai-settings'`
  - Every mutation action must call `persistSettings()` after updating state

  **Must NOT do**:
  - Do NOT store API keys in plain AsyncStorage — use `expo-secure-store` for API keys (following pattern from GitHubService)
  - Do NOT import AI SDK packages in the store (store only manages config, not runtime)
  - Do NOT auto-detect available on-device models (that's AIService's job)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Tasks 6, 11, 14, 18
  - **Blocked By**: Task 2 (needs type definitions)

  **References**:

  **Pattern References**:
  - `src/stores/noteStore.ts:1-80` — Zustand store pattern: State + Actions interfaces, create() with set/get, async CRUD actions, error handling with set({ error })
  - `src/stores/todoStore.ts:1-80` — Same pattern, simpler CRUD

  **API/Type References**:
  - `src/models/AIProvider.ts` — Types to use: AIProviderConfig, AIModelConfig, AIActionMode, AISettings
  - `src/services/GitHubService.ts` — Pattern for secure token storage using expo-secure-store

  **External References**:
  - expo-secure-store: `https://docs.expo.dev/versions/latest/sdk/securestore/` — For secure API key storage

  **WHY Each Reference Matters**:
  - `noteStore.ts` is the canonical Zustand store pattern. aiStore MUST follow the same structure: separate State/Actions interfaces, create() with set/get, persist pattern.
  - `GitHubService.ts` shows how the app currently stores sensitive tokens securely. API keys for AI providers must use the same approach.

  **Acceptance Criteria**:
  - [ ] `src/stores/aiStore.ts` exists with Zustand store
  - [ ] All actions listed above are implemented
  - [ ] API keys stored in expo-secure-store, not AsyncStorage
  - [ ] Settings persist to AsyncStorage on every mutation
  - [ ] Default Apple and Llama providers initialized on first load
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: AI store initializes with defaults
    Tool: Bash
    Steps:
      1. Run `grep "apple-default\|llama-default" src/stores/aiStore.ts`
    Expected Result: Both default provider IDs found in initialization
    Evidence: .sisyphus/evidence/task-4-defaults.txt

  Scenario: API keys use secure storage
    Tool: Bash
    Steps:
      1. Run `grep -i "securestore\|SecureStore\|secure-store\|expo-secure-store" src/stores/aiStore.ts`
    Expected Result: SecureStore import found
    Failure Indicators: API keys stored in plain AsyncStorage
    Evidence: .sisyphus/evidence/task-4-secure.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-4-tscheck.txt
  ```

  **Commit**: YES
  - Message: `feat(ai): add AI settings store with provider management`
  - Files: `src/stores/aiStore.ts`

- [x] 5. Chat Store (Threads, Messages, CRUD)

  **What to do**:
  - Create `src/stores/chatStore.ts` using Zustand (matching pattern from `src/stores/noteStore.ts`)
  - State shape:
    - `threads: ChatThreadSummary[]` — lightweight list for thread list screen
    - `activeThread: ChatThread | null` — full thread with all messages
    - `isLoading: boolean`
    - `error: string | null`
    - `isStreaming: boolean` — true while AI is generating a response
  - Actions:
    - `loadThreads()` — load thread summaries from ChatStorageService (lazy, doesn't load messages)
    - `loadThread(threadId: string)` — load full thread with messages from ChatStorageService
    - `createThread(title?: string)` — create new empty thread, set as active, persist
    - `deleteThread(threadId: string)` — delete thread and its messages
    - `renameThread(threadId: string, title: string)` — update thread title
    - `addMessage(threadId: string, message: ChatMessage)` — add message to active thread
    - `updateMessage(threadId: string, messageId: string, updates: Partial<ChatMessage>)` — update streaming message content
    - `setStreaming(isStreaming: boolean)` — toggle streaming state
    - `clearActiveThread()` — unload active thread
    - `clearError()` — clear error state
  - Do NOT import ChatStorageService directly — accept it as a constructor parameter or use dependency injection pattern so the store is testable

  **Must NOT do**:
  - Do NOT implement GitHub sync logic in the store (that's ChatStorageService's job)
  - Do NOT persist messages on every keystroke during streaming — only persist complete messages
  - Do NOT import AI SDK packages

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Tasks 7, 17
  - **Blocked By**: Task 2 (needs Chat model types)

  **References**:

  **Pattern References**:
  - `src/stores/noteStore.ts:1-169` — Full Zustand store with CRUD: create/update/delete patterns, error handling, loading states, sort/filter helpers
  - `src/stores/todoStore.ts:1-87` — Simpler CRUD store pattern

  **API/Type References**:
  - `src/models/Chat.ts` — Types: ChatMessage, ChatThread, ChatThreadSummary

  **WHY Each Reference Matters**:
  - `noteStore.ts` shows the complete pattern: State + Actions interfaces, async CRUD with StorageService, error handling, sorting. Chat store must follow this exactly.

  **Acceptance Criteria**:
  - [ ] `src/stores/chatStore.ts` exists with Zustand store
  - [ ] All actions listed above implemented
  - [ ] `threads` and `activeThread` managed separately (summaries vs full data)
  - [ ] `isStreaming` state tracked
  - [ ] No direct imports of ChatStorageService (injectable/testable)
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Chat store has all required actions
    Tool: Bash
    Steps:
      1. Run `grep -E "loadThreads|loadThread|createThread|deleteThread|renameThread|addMessage|updateMessage|setStreaming" src/stores/chatStore.ts`
    Expected Result: All 8 action names found
    Evidence: .sisyphus/evidence/task-5-actions.txt

  Scenario: Streaming state managed
    Tool: Bash
    Steps:
      1. Run `grep "isStreaming" src/stores/chatStore.ts`
    Expected Result: isStreaming found in state interface and setStreaming action
    Evidence: .sisyphus/evidence/task-5-streaming.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-5-tscheck.txt
  ```

  **Commit**: YES
  - Message: `feat(ai): add chat store with thread and message management`
  - Files: `src/stores/chatStore.ts`

- [x] 6. AI Service (Unified On-Device + Cloud)

  **What to do**:
  - Create `src/services/AIService.ts` as the unified interface for all AI interactions
  - This service wraps both on-device (Apple, Llama) and cloud (openai-compatible) providers behind a single API
  - Core functions:
    - `initializeModel(modelConfig: AIModelConfig): Promise<LanguageModel>` — returns a Vercel AI SDK-compatible model instance
      - For Apple: `apple()` from `@react-native-ai/apple`
      - For Llama: `llama.languageModel(modelId)` from `@react-native-ai/llama`, handle download + prepare
      - For openai-compatible: `createOpenAICompatible({ name, baseURL, apiKey }).chatModel(modelId)`
    - `sendMessage(model: LanguageModel, messages: CoreMessage[], tools?: Tool[]): AsyncGenerator<string>` — stream a response, yielding text chunks
    - `getAvailableOnDeviceModels(): Promise<AIModelConfig[]>` — check which on-device models are actually available (Apple requires iOS 26+, Llama requires downloaded model)
    - `isOnDeviceAvailable(): Promise<{ apple: boolean, llama: boolean }>` — check runtime availability
    - `downloadModel(modelConfig: AIModelConfig, onProgress: (pct: number) => void): Promise<void>` — download a Llama GGUF model with progress callback
    - `getModelStatus(modelConfig: AIModelConfig): Promise<'ready' | 'needs-download' | 'downloading' | 'unavailable'>`
  - Handle platform differences gracefully:
    - On Android: Apple provider unavailable, use Llama
    - On iOS < 26: Apple Foundation Models unavailable, show informative message
    - On iOS 26+ physical device: Apple available
  - Use the `ai` package's `streamText` function for streaming responses
  - Import types from `ai` package: `LanguageModel`, `CoreMessage`, `Tool`, `streamText`
  - Error handling: wrap all calls in try/catch, return meaningful error messages for network failures, model unavailable, rate limits

  **Must NOT do**:
  - Do NOT call noteStore or todoStore from this service (that's ActionExecutor's job)
  - Do NOT manage chat state (that's chatStore's job)
  - Do NOT persist anything (that's ChatStorageService's job)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Tasks 1, 2, 4

  **References**:

  **Pattern References**:
  - `src/services/GitHubService.ts` — Service pattern: class-based, async methods, error handling, secure store for tokens

  **API/Type References**:
  - `src/models/AIProvider.ts` — AIModelConfig, AIProviderType, AIProviderConfig types
  - `src/stores/aiStore.ts` — Provider and model configuration

  **External References**:
  - callstackincubator/ai Apple provider: `https://react-native-ai.dev/docs/apple/getting-started` — `apple()` factory, `generateText`, `streamText` usage
  - callstackincubator/ai Llama provider: `https://react-native-ai.dev/docs/llama/getting-started` — `llama.languageModel()`, download/prepare/unload lifecycle
  - Vercel AI SDK streamText: `https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text` — Streaming API
  - @ai-sdk/openai-compatible: `https://github.com/vercel/ai/blob/main/content/providers/02-openai-compatible-providers/index.mdx` — `createOpenAICompatible()` usage

  **WHY Each Reference Matters**:
  - `GitHubService.ts` — Shows the established pattern for external API services in this project
  - callstackincubator/ai docs — The exact API for creating model instances and streaming text
  - Vercel AI SDK docs — The `streamText` function signature and CoreMessage/Tool types

  **Acceptance Criteria**:
  - [ ] `src/services/AIService.ts` exists with all functions listed above
  - [ ] Apple, Llama, and openai-compatible providers all handled
  - [ ] Platform availability checks implemented
  - [ ] Model download with progress for Llama GGUF
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Service handles all provider types
    Tool: Bash
    Steps:
      1. Run `grep -E "apple|llama|openai-compatible|createOpenAICompatible" src/services/AIService.ts`
    Expected Result: All three provider types referenced
    Evidence: .sisyphus/evidence/task-6-providers.txt

  Scenario: Streaming function exists
    Tool: Bash
    Steps:
      1. Run `grep "streamText" src/services/AIService.ts`
    Expected Result: streamText import found from 'ai' package
    Evidence: .sisyphus/evidence/task-6-streaming.txt

  Scenario: Platform availability check
    Tool: Bash
    Steps:
      1. Run `grep -E "Platform\.(OS|isPad)|ios|android" src/services/AIService.ts`
    Expected Result: Platform checks present
    Evidence: .sisyphus/evidence/task-6-platform.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-6-tscheck.txt
  ```

  **Commit**: YES
  - Message: `feat(ai): add unified AI service for on-device and cloud models`
  - Files: `src/services/AIService.ts`

- [x] 7. Chat Storage Service (Persist Threads to GitHub Repo)

  **What to do**:
  - Create `src/services/ChatStorageService.ts`
  - Responsible for persisting and loading chat threads as files in the user's selected GitHub repo
  - Storage format: Each thread is a JSON file at `.gitnotes/chats/{threadId}.json` in the selected repo
  - Thread JSON format: `{ id, title, messages: ChatMessage[], createdAt, updatedAt }` — direct serialization of ChatThread type
  - An index file at `.gitnotes/chats/index.json` stores thread summaries for fast listing: `{ threads: ChatThreadSummary[] }`
  - Core functions:
    - `initializeChatStorage(repoOwner: string, repoName: string, branch: string): Promise<void>` — create `.gitnotes/chats/` directory if not exists
    - `loadThreadSummaries(repoOwner: string, repoName: string, branch: string): Promise<ChatThreadSummary[]>` — read index.json
    - `loadThread(repoOwner: string, repoName: string, branch: string, threadId: string): Promise<ChatThread | null>` — read individual thread file
    - `saveThread(thread: ChatThread): Promise<void>` — write thread JSON, update index.json
    - `deleteThread(repoOwner: string, repoName: string, branch: string, threadId: string): Promise<void>` — delete thread file, update index
    - `isChatStorageInitialized(repoOwner: string, repoName: string, branch: string): Promise<boolean>` — check if .gitnotes/chats/ exists
  - Use GitHub API (via `GitHubService` pattern) for file operations:
    - GET /repos/{owner}/{repo}/contents/{path} for reading
    - PUT /repos/{owner}/{repo}/contents/{path} for writing (with SHA for updates)
  - Handle offline gracefully: queue saves for when network returns (following pattern from NoteGitHubSyncService)
  - Use AsyncStorage as a local cache for faster loading (load from cache first, then refresh from GitHub)

  **Must NOT do**:
  - Do NOT store chat content in AsyncStorage only (GitHub repo is the source of truth)
  - Do NOT modify existing sync services or storage patterns
  - Do NOT use the note/todo sync queue for chat data (separate concern)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8)
  - **Blocks**: Tasks 15, 17
  - **Blocked By**: Tasks 2, 5

  **References**:

  **Pattern References**:
  - `src/services/NoteGitHubSyncService.ts` — Pattern for GitHub file operations: read/write/delete via Contents API, conflict handling with SHA, offline queue
  - `src/services/StorageService.ts` — AsyncStorage wrapper pattern with per-item keys
  - `src/services/GitHubService.ts` — GitHub API client: authentication, request methods, error handling

  **API/Type References**:
  - `src/models/Chat.ts` — ChatThread, ChatThreadSummary, ChatMessage types

  **WHY Each Reference Matters**:
  - `NoteGitHubSyncService.ts` is the exact pattern for reading/writing files to GitHub repos. ChatStorageService MUST follow the same approach for Contents API usage and conflict resolution.

  **Acceptance Criteria**:
  - [ ] `src/services/ChatStorageService.ts` exists with all functions
  - [ ] Threads stored as JSON in `.gitnotes/chats/` directory
  - [ ] Index file maintained for fast thread listing
  - [ ] Local AsyncStorage cache for performance
  - [ ] GitHub Contents API used for file operations
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Storage path pattern correct
    Tool: Bash
    Steps:
      1. Run `grep -E "\.gitnotes/chats|index\.json" src/services/ChatStorageService.ts`
    Expected Result: Both path patterns found
    Evidence: .sisyphus/evidence/task-7-paths.txt

  Scenario: GitHub API usage
    Tool: Bash
    Steps:
      1. Run `grep -E "contents|repos.*contents" src/services/ChatStorageService.ts`
    Expected Result: GitHub Contents API references found
    Evidence: .sisyphus/evidence/task-7-github.txt

  Scenario: Local cache implemented
    Tool: Bash
    Steps:
      1. Run `grep -i "AsyncStorage\|cache" src/services/ChatStorageService.ts`
    Expected Result: AsyncStorage or cache references found
    Evidence: .sisyphus/evidence/task-7-cache.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-7-tscheck.txt
  ```

  **Commit**: YES
  - Message: `feat(ai): add chat storage service for GitHub repo persistence`
  - Files: `src/services/ChatStorageService.ts`

- [x] 8. Context Service (Gather File/Folder/Repo Content)

  **What to do**:
  - Create `src/services/ContextService.ts`
  - Responsible for gathering content from files, folders, and repos to use as AI context
  - Core functions:
    - `getFileContent(owner: string, repo: string, branch: string, path: string): Promise<string>` — read a single file's content from GitHub
    - `getFolderContents(owner: string, repo: string, branch: string, folderPath: string): Promise<ContextFile[]>` — list files in folder with metadata
    - `getRepoStructure(owner: string, repo: string, branch: string): Promise<ContextFile[]>` — get top-level repo structure
    - `buildContextString(items: AIContextItem[]): Promise<string>` — given selected context items, fetch content and build a formatted string for the AI system prompt
      - For files: include filename + full content
      - For folders: include file listing + contents of each file (with size limit per file, e.g., 50KB)
      - For repos: include folder structure summary
    - `getLocalNotesForContext(folderPath?: string): Promise<string>` — gather local notes from noteStore as context (don't need GitHub API)
    - `getLocalTodosForContext(): Promise<string>` — gather local todos from todoStore as context
  - Use GitHub Contents API for remote files (following GitHubService pattern)
  - For local notes/todos: read directly from noteStore/todoStore state
  - Respect content size limits: if total context exceeds ~100KB, truncate individual files and note that truncation occurred
  - Return structured context that includes file metadata (name, path, size) alongside content

  **Must NOT do**:
  - Do NOT send context to the AI (that's the system prompt builder's job)
  - Do NOT modify any files — this is read-only
  - Do NOT fetch binary files (images, PDFs) — skip them with a note

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Tasks 9, 13
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/services/GitHubService.ts` — GitHub API client pattern: authenticated requests, Contents API usage, error handling
  - `src/hooks/useGitHubQueries.ts` — TanStack Query pattern for GitHub data fetching

  **API/Type References**:
  - `src/models/AIProvider.ts` — AIContextItem type
  - `src/stores/noteStore.ts` — For reading local notes
  - `src/stores/todoStore.ts` — For reading local todos

  **WHY Each Reference Matters**:
  - `GitHubService.ts` has the exact pattern for calling GitHub Contents API. ContextService must reuse the same auth and request patterns.
  - `noteStore.ts` and `todoStore.ts` have the data structures for local notes/todos that need to be formatted as AI context.

  **Acceptance Criteria**:
  - [ ] `src/services/ContextService.ts` exists with all functions
  - [ ] File, folder, and repo context gathering implemented
  - [ ] Local notes and todos can be gathered as context
  - [ ] Content size limits enforced with truncation
  - [ ] Binary files skipped gracefully
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Context service handles all item types
    Tool: Bash
    Steps:
      1. Run `grep -E "getFileContent|getFolderContents|getRepoStructure|buildContextString" src/services/ContextService.ts`
    Expected Result: All 4 functions found
    Evidence: .sisyphus/evidence/task-8-functions.txt

  Scenario: Size limits enforced
    Tool: Bash
    Steps:
      1. Run `grep -iE "truncat|limit|size|max" src/services/ContextService.ts`
    Expected Result: Size limit checks found
    Evidence: .sisyphus/evidence/task-8-limits.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-8-tscheck.txt
  ```

  **Commit**: YES
  - Message: `feat(ai): add context service for file/folder/repo content gathering`
  - Files: `src/services/ContextService.ts`

- [x] 9. AI Tools + System Prompt

  **What to do**:
  - Create `src/services/ai/tools.ts` — Vercel AI SDK tool definitions for note/todo CRUD
  - Define tools using `tool()` from the `ai` package:
    - `create_note`: `{ title: string, content: string, tags?: string[], format?: 'markdown' | 'neorg' | 'org' }` → creates a new note via noteStore.createNote()
    - `edit_note`: `{ noteId: string, title?: string, content?: string, tags?: string[] }` → updates existing note via noteStore.updateNote()
    - `delete_note`: `{ noteId: string }` → deletes note via noteStore.deleteNote()
    - `search_notes`: `{ query: string }` → searches notes via noteStore, returns matching titles + previews
    - `get_note`: `{ noteId: string }` → returns full note content
    - `create_todo`: `{ text: string, dueDate?: string, priority?: 'low' | 'medium' | 'high', tags?: string[] }` → creates todo via todoStore.createTodo()
    - `edit_todo`: `{ todoId: string, text?: string, completed?: boolean, dueDate?: string, priority?: string }` → updates todo
    - `delete_todo`: `{ todoId: string }` → deletes todo
    - `search_todos`: `{ query: string, includeCompleted?: boolean }` → searches todos
    - `get_todos`: `{ filter?: 'all' | 'pending' | 'completed' }` → returns todo list
  - Each tool must have: description (clear, specific), parameters (Zod schema), and execute function
  - Create `src/services/ai/systemPrompt.ts` — builds the AI system prompt dynamically:
    - Base prompt: "You are GitNotes AI, an assistant that helps users manage their notes and todos. You can create, edit, search, and delete notes and todos using the tools available to you."
    - Append context: if user attached files/folders/repos, include their content with clear section headers
    - Append current state summary: "The user currently has X notes and Y todos." (from stores)
    - Append action mode instruction: if mode is 'confirm', add "Before making any changes, describe what you plan to do and wait for user confirmation."
    - Return complete system prompt string

  **Must NOT do**:
  - Do NOT call noteStore/todoStore directly from tool execute functions in this file — the execute functions should be registered by the action executor (Task 10)
  - Do NOT hardcode the system prompt — it must be dynamic based on context and settings

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 10)
  - **Blocks**: Tasks 10, 16
  - **Blocked By**: Tasks 6, 8

  **References**:

  **Pattern References**:
  - `src/models/Note.ts:33-60` — NoteCreateInput/NoteUpdateInput types — tool parameters must match these exactly
  - `src/models/Todo.ts:32-62` — TodoCreateInput/TodoUpdateInput types

  **API/Type References**:
  - `src/stores/noteStore.ts:16-26` — NoteActions interface: createNote, updateNote, deleteNote signatures
  - `src/stores/todoStore.ts:12-17` — TodoActions interface: createTodo, updateTodo, deleteTodo signatures

  **External References**:
  - Vercel AI SDK tools: `https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling` — `tool()` function, Zod schemas, execute callbacks

  **WHY Each Reference Matters**:
  - Tool parameters MUST match the CreateInput/UpdateInput types from Note and Todo models so the action executor can pass them directly to store methods.
  - Vercel AI SDK tools doc shows the exact `tool()` API pattern.

  **Acceptance Criteria**:
  - [ ] `src/services/ai/tools.ts` exists with all 10 tool definitions
  - [ ] Each tool has description, Zod parameter schema, and placeholder execute
  - [ ] `src/services/ai/systemPrompt.ts` exists with dynamic prompt builder
  - [ ] System prompt includes: base instruction, context injection, state summary, action mode
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: All 10 tools defined
    Tool: Bash
    Steps:
      1. Run `grep -E "create_note|edit_note|delete_note|search_notes|get_note|create_todo|edit_todo|delete_todo|search_todos|get_todos" src/services/ai/tools.ts`
    Expected Result: All 10 tool names found
    Evidence: .sisyphus/evidence/task-9-tools.txt

  Scenario: Tools use Zod schemas
    Tool: Bash
    Steps:
      1. Run `grep -E "z\.|zod|schema" src/services/ai/tools.ts`
    Expected Result: Zod schema definitions found
    Evidence: .sisyphus/evidence/task-9-schemas.txt

  Scenario: System prompt is dynamic
    Tool: Bash
    Steps:
      1. Run `grep -E "function|context|mode|export" src/services/ai/systemPrompt.ts`
    Expected Result: Function that builds prompt with context and mode parameters
    Evidence: .sisyphus/evidence/task-9-prompt.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-9-tscheck.txt
  ```

  **Commit**: YES (groups with Task 10)
  - Message: `feat(ai): add AI tool definitions, system prompt, and action executor`
  - Files: `src/services/ai/tools.ts`, `src/services/ai/systemPrompt.ts`

- [x] 10. AI Action Executor

  **What to do**:
  - Create `src/services/ai/actionExecutor.ts`
  - This service bridges AI tool calls to actual noteStore/todoStore operations
  - Core function: `executeToolCall(toolName: string, args: Record<string, unknown>, mode: 'auto' | 'confirm'): Promise<ActionExecutorResult>`
  - Result type: `{ success: boolean, data?: unknown, error?: string, requiresConfirmation: boolean, proposedChanges?: ProposedChange }`
  - `ProposedChange`: `{ type: string, description: string, targetId?: string, details: Record<string, unknown> }`
  - For each tool:
    - `create_note` → call `noteStore.createNote()`, return created note
    - `edit_note` → call `noteStore.updateNote()`, return updated note
    - `delete_note` → call `noteStore.deleteNote()`, return success
    - `search_notes` → filter noteStore.notes with query, return matching summaries
    - `get_note` → call `noteStore.getNoteById()`, return full note
    - `create_todo` → call `todoStore.createTodo()`, return created todo
    - `edit_todo` → call `todoStore.updateTodo()`, return updated todo
    - `delete_todo` → call `todoStore.deleteTodo()`, return success
    - `search_todos` → filter todoStore.todos, return matching items
    - `get_todos` → return filtered todoStore.todos
  - In **confirm mode**: for destructive/creative tools (create, edit, delete), set `requiresConfirmation: true` and populate `proposedChanges` but do NOT execute. The chat screen will show a confirmation UI and call back with approval.
  - In **auto mode**: execute immediately, set `requiresConfirmation: false`
  - Read-only tools (search, get) always execute immediately regardless of mode

  **Must NOT do**:
  - Do NOT modify note/todo models or stores
  - Do NOT show UI — this is pure logic; the chat screen handles confirmation UI
  - Do NOT batch operations — each tool call is independent

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 9)
  - **Blocks**: Task 16
  - **Blocked By**: Task 9

  **References**:

  **API/Type References**:
  - `src/services/ai/tools.ts` — Tool names and parameter schemas
  - `src/stores/noteStore.ts:16-26` — NoteActions: createNote, updateNote, deleteNote, getNoteById
  - `src/stores/todoStore.ts:12-17` — TodoActions: createTodo, updateTodo, deleteTodo
  - `src/models/Note.ts:33-60` — NoteCreateInput, NoteUpdateInput types
  - `src/models/Todo.ts:32-62` — TodoCreateInput, TodoUpdateInput types
  - `src/models/AIProvider.ts` — AIActionMode type

  **WHY Each Reference Matters**:
  - The executor must translate tool arguments (from tools.ts schemas) into the exact CreateInput/UpdateInput types that the stores expect. Mismatches here will cause runtime errors.

  **Acceptance Criteria**:
  - [ ] `src/services/ai/actionExecutor.ts` exists with `executeToolCall` function
  - [ ] All 10 tool names handled in switch/if-else
  - [ ] Auto mode executes immediately
  - [ ] Confirm mode returns proposedChanges without executing (for create/edit/delete)
  - [ ] Read-only tools always execute immediately
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: All tool names handled
    Tool: Bash
    Steps:
      1. Run `grep -E "create_note|edit_note|delete_note|search_notes|get_note|create_todo|edit_todo|delete_todo|search_todos|get_todos" src/services/ai/actionExecutor.ts`
    Expected Result: All 10 tool names found in handler logic
    Evidence: .sisyphus/evidence/task-10-handlers.txt

  Scenario: Confirm mode returns proposed changes
    Tool: Bash
    Steps:
      1. Run `grep -E "requiresConfirmation|proposedChanges|confirm" src/services/ai/actionExecutor.ts`
    Expected Result: Confirm mode logic found with proposedChanges return
    Evidence: .sisyphus/evidence/task-10-confirm.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-10-tscheck.txt
  ```

  **Commit**: YES (groups with Task 9)
  - Message: `feat(ai): add AI tool definitions, system prompt, and action executor`
  - Files: `src/services/ai/actionExecutor.ts`

- [x] 11. Floating AI Button (Draggable, All Screens)

  **What to do**:
  - Create `src/components/ai/FloatingAIButton.tsx`
  - A circular button (56x56) that floats above all screens, draggable by the user
  - Uses `react-native-gesture-handler` for drag gestures (already in dependencies)
  - Uses `react-native-reanimated` for smooth animations (already in dependencies)
  - Button design:
    - Circular with neumorphic shadow (use Surface or custom shadow matching the design system)
    - Icon: sparkle/brain icon from `@expo/vector-icons` (Ionicons `sparkles` or `chatbubble-ellipses`)
    - Background: use theme's `colors.primary`
    - Shows a subtle pulse animation when idle to indicate interactivity
  - Drag behavior:
    - User can drag the button anywhere on screen
    - Button snaps to nearest edge (left or right) when released
    - Position persists across app launches (save to AsyncStorage key `'ai-button-position'`)
    - Cannot be dragged off-screen (constrain to safe area)
  - Tap behavior:
    - Navigates to `ChatThreadList` screen via React Navigation
    - Haptic feedback on tap (using `HapticService` from `src/utils/haptics.ts`)
  - Visibility:
    - Reads `isEnabled` from `aiStore` — if disabled, button is hidden completely
    - Always visible on all screens (rendered as overlay in AppNavigator)
    - Does not overlap with the tab bar (offset from bottom)

  **Must NOT do**:
  - Do NOT render this inside individual screens — it must be a global overlay
  - Do NOT block navigation gestures or tab bar interaction
  - Do NOT add a new tab for AI

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 12, 13, 14, 15)
  - **Blocks**: Task 19
  - **Blocked By**: Task 4 (needs aiStore for isEnabled)

  **References**:

  **Pattern References**:
  - `src/components/ui/Surface.tsx` — Neumorphic shadow container, use this or mimic its shadow pattern for the button
  - `src/utils/haptics.ts` — HapticService for tactile feedback
  - `src/contexts/ThemeContext.tsx` — useTheme() for colors, isDark, consistent styling

  **API/Type References**:
  - `src/stores/aiStore.ts` — isEnabled state to control visibility

  **External References**:
  - react-native-gesture-handler: `https://docs.swmansion.com/react-native-gesture-handler/docs/` — Gesture API for dragging
  - react-native-reanimated: `https://docs.swmansion.com/react-native-reanimated/` — useAnimatedStyle, withTiming

  **WHY Each Reference Matters**:
  - `Surface.tsx` defines the exact neumorphic shadow style. The floating button must visually belong to the same design system.
  - `ThemeContext.tsx` ensures the button adapts to light/dark themes correctly.

  **Acceptance Criteria**:
  - [ ] `src/components/ai/FloatingAIButton.tsx` exists
  - [ ] Button is draggable with gesture handler
  - [ ] Position persists in AsyncStorage
  - [ ] Snaps to nearest edge on release
  - [ ] Hidden when aiStore.isEnabled is false
  - [ ] Uses neumorphic styling from theme
  - [ ] Haptic feedback on tap
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Button component exists with gesture handling
    Tool: Bash
    Steps:
      1. Run `grep -E "Gesture|gesture|panHandler|PanGesture" src/components/ai/FloatingAIButton.tsx`
    Expected Result: Gesture handler imports/usage found
    Evidence: .sisyphus/evidence/task-11-gesture.txt

  Scenario: Position persistence
    Tool: Bash
    Steps:
      1. Run `grep -E "AsyncStorage|position|ai-button-position" src/components/ai/FloatingAIButton.tsx`
    Expected Result: Position save/load logic found
    Evidence: .sisyphus/evidence/task-11-position.txt

  Scenario: AI toggle respected
    Tool: Bash
    Steps:
      1. Run `grep -E "isEnabled|aiStore" src/components/ai/FloatingAIButton.tsx`
    Expected Result: isEnabled check found, hidden when false
    Evidence: .sisyphus/evidence/task-11-toggle.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-11-tscheck.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(ai): add floating AI button and chat UI components`
  - Files: `src/components/ai/FloatingAIButton.tsx`

- [x] 12. Chat Message Bubble + Input Bar

  **What to do**:
  - Create `src/components/ai/ChatMessageBubble.tsx`
    - Renders a single chat message (user, assistant, or system)
    - User messages: right-aligned, primary color background, white text
    - Assistant messages: left-aligned, surface color background, dark text
    - System messages: centered, muted color, italic
    - Support for:
      - Streaming text (show typing indicator or partial text with cursor)
      - Tool call display: show "🔧 Creating note 'My Title'..." with result preview
      - Markdown rendering in assistant messages (use `react-native-marked` already in deps)
      - Timestamp display (small text below message)
    - Follow neumorphic style: use Surface component, rounded corners, soft shadows
  - Create `src/components/ai/ChatInputBar.tsx`
    - Sticky input bar at bottom of chat screen
    - Components:
      - Text input (multiline, auto-expanding, max 4 lines)
      - Attach button (paperclip icon) on left — opens ContextPickerModal
      - Send button (arrow/paper-plane icon) on right — disabled when empty or streaming
      - Context chips above input showing attached file/folder/repo with remove button
    - Follow neumorphic style from existing components
    - Use theme colors for consistent light/dark appearance

  **Must NOT do**:
  - Do NOT implement chat logic here — just UI components
  - Do NOT use third-party chat UI libraries

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 11, 13, 14, 15)
  - **Blocks**: Task 16
  - **Blocked By**: Task 2 (needs ChatMessage type)

  **References**:

  **Pattern References**:
  - `src/components/ui/Surface.tsx` — Neumorphic container for message bubbles
  - `src/components/ui/Button.tsx` — Button variants for send/attach buttons
  - `src/components/ui/Input.tsx` — If exists, pattern for text inputs
  - `src/components/ui/Chip.tsx` — If exists, pattern for context chips

  **API/Type References**:
  - `src/models/Chat.ts` — ChatMessage type for rendering

  **External References**:
  - `react-native-marked` (already in package.json) — For rendering markdown in assistant messages

  **WHY Each Reference Matters**:
  - Surface, Button, Chip are the established neumorphic UI primitives. Chat components must use them for visual consistency.

  **Acceptance Criteria**:
  - [ ] `src/components/ai/ChatMessageBubble.tsx` exists
  - [ ] User/assistant/system message styles differentiated
  - [ ] Streaming text display supported
  - [ ] Tool call rendering implemented
  - [ ] Markdown rendering in assistant messages
  - [ ] `src/components/ai/ChatInputBar.tsx` exists
  - [ ] Attach button, send button, multiline input
  - [ ] Context chips display
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Message bubble handles all roles
    Tool: Bash
    Steps:
      1. Run `grep -E "user|assistant|system|role" src/components/ai/ChatMessageBubble.tsx`
    Expected Result: All three message roles handled with different styling
    Evidence: .sisyphus/evidence/task-12-roles.txt

  Scenario: Input bar has all elements
    Tool: Bash
    Steps:
      1. Run `grep -E "attach|send|TextInput|multiline" src/components/ai/ChatInputBar.tsx`
    Expected Result: Attach button, send button, and multiline input all present
    Evidence: .sisyphus/evidence/task-12-input.txt

  Scenario: Markdown rendering used
    Tool: Bash
    Steps:
      1. Run `grep -E "Markdown|react-native-marked|marked" src/components/ai/ChatMessageBubble.tsx`
    Expected Result: Markdown renderer imported for assistant messages
    Evidence: .sisyphus/evidence/task-12-markdown.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-12-tscheck.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(ai): add floating AI button and chat UI components`
  - Files: `src/components/ai/ChatMessageBubble.tsx`, `src/components/ai/ChatInputBar.tsx`

- [x] 13. Context Picker Modal (File/Folder/Repo Selection)

  **What to do**:
  - Create `src/components/ai/ContextPickerModal.tsx`
  - A full-screen modal that lets users pick files, folders, or repos as AI context
  - Layout:
    - Tab bar at top: "Files" | "Folders" | "Repo" | "Local Notes" | "Local Todos"
    - Content area shows selectable items based on active tab
    - Selected items shown with checkmark
    - Done button at bottom to confirm selection
  - "Files" tab:
    - Show file tree from active repo (reuse repo file browser pattern from ExploreScreen)
    - Allow selecting individual files
    - Show file size and type icon
  - "Folders" tab:
    - Show folder tree, allow selecting entire folders
    - Show file count per folder
  - "Repo" tab:
    - List user's connected repos (from repoStore)
    - Selecting a repo includes its structure as context
  - "Local Notes" tab:
    - List notes from noteStore with search
    - Select notes to include their full content
  - "Local Todos" tab:
    - List todos from todoStore grouped by completion status
    - Select to include as context
  - Multi-select: user can pick multiple items across tabs
  - Use existing neumorphic UI primitives (Surface, Group, GroupRow, Button, Chip)

  **Must NOT do**:
  - Do NOT fetch AI responses — this is just a picker
  - Do NOT create a new file browser from scratch — reuse repo file browsing patterns

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 11, 12, 14, 15)
  - **Blocks**: Task 16
  - **Blocked By**: Task 8 (needs ContextService for understanding data flow)

  **References**:

  **Pattern References**:
  - `src/screens/ExploreScreen.tsx` — File browser pattern: repo file tree, expandable folders, file icons
  - `src/screens/NotesListScreen.tsx` — Notes list with search/filter pattern
  - `src/screens/TodoListScreen.tsx` — Todos list pattern with completion grouping
  - `src/components/ui/Modal.tsx` — If exists, modal pattern; otherwise use React Native Modal

  **API/Type References**:
  - `src/models/AIProvider.ts` — AIContextItem type for selected items
  - `src/stores/noteStore.ts` — notes array for local notes tab
  - `src/stores/todoStore.ts` — todos array for local todos tab
  - `src/stores/repoStore.ts` — repositories for repo tab

  **WHY Each Reference Matters**:
  - `ExploreScreen.tsx` already has a working file tree browser. The context picker should reuse the same navigation pattern and visual style rather than inventing a new one.

  **Acceptance Criteria**:
  - [ ] `src/components/ai/ContextPickerModal.tsx` exists
  - [ ] 5 tabs: Files, Folders, Repo, Local Notes, Local Todos
  - [ ] Multi-select across tabs
  - [ ] Search/filter in notes and todos tabs
  - [ ] Neumorphic styling matching design system
  - [ ] Returns selected AIContextItem[] on confirm
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: All tabs present
    Tool: Bash
    Steps:
      1. Run `grep -E "Files|Folders|Repo|Local Notes|Local Todos" src/components/ai/ContextPickerModal.tsx`
    Expected Result: All 5 tab labels found
    Evidence: .sisyphus/evidence/task-13-tabs.txt

  Scenario: Multi-select implemented
    Tool: Bash
    Steps:
      1. Run `grep -E "selected|onSelect|toggleSelect|multiSelect" src/components/ai/ContextPickerModal.tsx`
    Expected Result: Selection state management found
    Evidence: .sisyphus/evidence/task-13-select.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-13-tscheck.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(ai): add floating AI button and chat UI components`
  - Files: `src/components/ai/ContextPickerModal.tsx`

- [x] 14. Provider Config Modal + Model Selector

  **What to do**:
  - Create `src/components/ai/ProviderConfigModal.tsx`
    - Modal for adding/editing a custom OpenAI-compatible provider
    - Fields:
      - Name (text input): e.g., "My Ollama", "OpenAI", "Local LM Studio"
      - Base URL (text input): e.g., "http://localhost:11434/v1", "https://api.openai.com/v1"
      - API Key (secure text input): stored in expo-secure-store via aiStore
    - Save button: validates fields, calls aiStore.addProvider() or aiStore.updateProvider()
    - Delete button (edit mode only): calls aiStore.removeProvider()
    - Test Connection button: tries to hit `{baseURL}/models` endpoint to validate and discover available models
    - When models are discovered: auto-populate provider's models array and update aiStore
    - Use neumorphic styling (Surface, Group, Input, Button)
  - Create `src/components/ai/ModelSelector.tsx`
    - Dropdown/picker component for selecting the active AI model
    - Groups models by provider: "Apple Intelligence", "Llama (On-Device)", then custom provider names
    - Shows model status: ready ✓, needs download ↓, unavailable ✗
    - For Llama models needing download: shows download button with progress bar
    - For unavailable models (e.g., Apple on Android): grayed out with tooltip explaining why
    - Calls aiStore.selectModel() on selection

  **Must NOT do**:
  - Do NOT call the AI service directly — only manage provider config
  - Do NOT hardcode model lists — discover from providers dynamically

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 11, 12, 13, 15)
  - **Blocks**: Task 18
  - **Blocked By**: Task 4 (needs aiStore for provider CRUD)

  **References**:

  **Pattern References**:
  - `src/screens/SettingsScreen.tsx:52-80` — Token modal pattern: modal state, text input, paste button, verify button, secure toggle
  - `src/components/ui/Group.tsx` — GroupRow for settings-style form layout

  **API/Type References**:
  - `src/stores/aiStore.ts` — addProvider, updateProvider, removeProvider, selectModel
  - `src/models/AIProvider.ts` — AIProviderConfig, AIModelConfig types

  **WHY Each Reference Matters**:
  - `SettingsScreen.tsx` token modal is the established pattern for entering and validating API keys. The provider config modal should follow the same UX flow (input → validate → save).

  **Acceptance Criteria**:
  - [ ] `src/components/ai/ProviderConfigModal.tsx` exists with name/URL/API key fields
  - [ ] Test connection validates provider and discovers models
  - [ ] `src/components/ai/ModelSelector.tsx` exists with grouped model list
  - [ ] Download UI for Llama models
  - [ ] Unavailable models shown but disabled
  - [ ] Neumorphic styling
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Provider config has required fields
    Tool: Bash
    Steps:
      1. Run `grep -E "name|baseURL|apiKey|baseURL" src/components/ai/ProviderConfigModal.tsx`
    Expected Result: All three fields referenced
    Evidence: .sisyphus/evidence/task-14-fields.txt

  Scenario: Test connection implemented
    Tool: Bash
    Steps:
      1. Run `grep -E "test|connection|/models|validate" src/components/ai/ProviderConfigModal.tsx`
    Expected Result: Connection testing logic found
    Evidence: .sisyphus/evidence/task-14-test.txt

  Scenario: Model selector groups by provider
    Tool: Bash
    Steps:
      1. Run `grep -E "provider|group|section|header" src/components/ai/ModelSelector.tsx`
    Expected Result: Grouping logic found
    Evidence: .sisyphus/evidence/task-14-groups.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-14-tscheck.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(ai): add floating AI button and chat UI components`
  - Files: `src/components/ai/ProviderConfigModal.tsx`, `src/components/ai/ModelSelector.tsx`

- [x] 15. Chat Repo Picker Modal (First-Use Setup)

  **What to do**:
  - Create `src/components/ai/ChatRepoPickerModal.tsx`
  - Shown on first AI chat use when no chat repo is configured
  - Layout:
    - Title: "Choose Chat Storage"
    - Description: "Select a GitHub repository to store your AI chat conversations. Chats are saved as files in your repo."
    - Repo list: show user's connected repos (from repoStore) with search/filter
    - Each repo shows: name, owner, visibility icon
    - Branch selector: dropdown defaulting to 'main'
    - Optional "Create new repo" button that opens GitHub to create one
    - Confirm button: saves to aiStore.setChatRepo(), initializes .gitnotes/chats/ via ChatStorageService
  - If user has no repos connected, show message directing to Settings to add repos first
  - Use neumorphic styling (Surface, Group, Button)

  **Must NOT do**:
  - Do NOT create the repo automatically — user must choose
  - Do NOT block the app if dismissed — show again next time AI chat is opened

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 11, 12, 13, 14)
  - **Blocks**: Task 18
  - **Blocked By**: Task 7 (needs ChatStorageService for initialization)

  **References**:

  **Pattern References**:
  - `src/screens/SettingsScreen.tsx:45-100` — Repo picker modal pattern: repo list, search, add repo flow

  **API/Type References**:
  - `src/stores/repoStore.ts` — Connected repositories list
  - `src/stores/aiStore.ts` — setChatRepo action

  **WHY Each Reference Matters**:
  - SettingsScreen already has a repo picker modal with search. The chat repo picker should follow the same pattern for consistency.

  **Acceptance Criteria**:
  - [ ] `src/components/ai/ChatRepoPickerModal.tsx` exists
  - [ ] Repo list with search from repoStore
  - [ ] Branch selector
  - [ ] Initializes .gitnotes/chats/ on confirm
  - [ ] Handles no-repos state gracefully
  - [ ] Neumorphic styling
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Repo list and search
    Tool: Bash
    Steps:
      1. Run `grep -E "repoStore|repositories|search|filter" src/components/ai/ChatRepoPickerModal.tsx`
    Expected Result: Repo list loading and search logic found
    Evidence: .sisyphus/evidence/task-15-repos.txt

  Scenario: Initialization on confirm
    Tool: Bash
    Steps:
      1. Run `grep -E "initializeChatStorage|setChatRepo|\.gitnotes" src/components/ai/ChatRepoPickerModal.tsx`
    Expected Result: Chat storage initialization called on confirm
    Evidence: .sisyphus/evidence/task-15-init.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-15-tscheck.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(ai): add floating AI button and chat UI components`
  - Files: `src/components/ai/ChatRepoPickerModal.tsx`

- [ ] 16. Chat Screen (Full Chat UI with Streaming)

  **What to do**:
  - Create `src/screens/ChatScreen.tsx` — the main chat interface
  - This is the heart of the AI chat feature
  - Screen layout (from top to bottom):
    - `ScreenHeader` with thread title, back button, and thread options (rename/delete)
    - Message list (FlatList using `@shopify/flash-list` for performance):
      - Renders ChatMessageBubble for each message
      - Auto-scrolls to bottom on new messages
      - Shows "GitNotes Chat" welcome message on empty thread
    - Context chips row (if contexts attached)
    - ChatInputBar at bottom
  - Core chat flow:
    1. User types message → add user message to chatStore
    2. Build messages array: system prompt (from systemPrompt.ts) + chat history + context
    3. Call AIService.streamText() with model from aiStore and tools from tools.ts
    4. Stream response: update assistant message in chatStore as chunks arrive
    5. Handle tool calls: when AI calls a tool → execute via actionExecutor
       - If auto mode: execute immediately, add result message, continue stream
       - If confirm mode: pause stream, show confirmation UI, wait for user, then execute or cancel
    6. Persist complete thread via ChatStorageService after streaming ends
  - Confirmation UI (for confirm mode):
    - Inline card showing proposed changes (e.g., "Create note: 'Meeting Notes'")
    - "Apply" and "Cancel" buttons
    - On Apply: execute tool, show result, continue conversation
    - On Cancel: send cancellation message, continue conversation
  - Error handling:
    - Network errors: show retry button
    - Model unavailable: show message suggesting to switch model
    - Streaming interruption: save partial message, show "Response interrupted"
  - Pull-to-refresh: reload thread from GitHub

  **Must NOT do**:
  - Do NOT implement thread management here (that's ChatThreadListScreen)
  - Do NOT call noteStore/todoStore directly — all CRUD goes through actionExecutor
  - Do NOT block the UI during streaming — always show partial results

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 17, 18)
  - **Blocks**: Task 19
  - **Blocked By**: Tasks 9, 10, 12, 13

  **References**:

  **Pattern References**:
  - `src/screens/NoteEditorScreen.tsx` — Screen layout pattern: ScreenHeader, content area, bottom bar
  - `src/components/ui/ScreenHeader.tsx` — Screen header component

  **API/Type References**:
  - `src/services/AIService.ts` — sendMessage / streamText function
  - `src/services/ai/tools.ts` — Tool definitions to pass to AI
  - `src/services/ai/systemPrompt.ts` — System prompt builder
  - `src/services/ai/actionExecutor.ts` — executeToolCall for handling AI actions
  - `src/stores/chatStore.ts` — addMessage, updateMessage, setStreaming
  - `src/stores/aiStore.ts` — selectedModelId, actionMode, isEnabled
  - `src/components/ai/ChatMessageBubble.tsx` — Message rendering component
  - `src/components/ai/ChatInputBar.tsx` — Input component
  - `src/components/ai/ContextPickerModal.tsx` — Context selection

  **WHY Each Reference Matters**:
  - `NoteEditorScreen.tsx` shows the established screen layout pattern. ChatScreen must follow the same header/content/bottom-bar structure.
  - The services and components listed are all built in earlier tasks — ChatScreen is the integration point.

  **Acceptance Criteria**:
  - [ ] `src/screens/ChatScreen.tsx` exists
  - [ ] Messages render with ChatMessageBubble
  - [ ] Streaming responses update in real-time
  - [ ] Tool calls handled via actionExecutor
  - [ ] Confirm mode shows inline confirmation UI
  - [ ] Auto mode executes tools immediately
  - [ ] Context picker opens from input bar
  - [ ] Error states handled with retry
  - [ ] Thread persisted after each message
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Chat screen imports all dependencies
    Tool: Bash
    Steps:
      1. Run `grep -E "import.*from.*services/ai|import.*from.*stores|import.*from.*components/ai" src/screens/ChatScreen.tsx`
    Expected Result: Imports from AIService, chatStore, aiStore, actionExecutor, UI components
    Evidence: .sisyphus/evidence/task-16-imports.txt

  Scenario: Streaming implementation
    Tool: Bash
    Steps:
      1. Run `grep -E "stream|onChunk|updateMessage|setStreaming" src/screens/ChatScreen.tsx`
    Expected Result: Streaming logic with chunk handling and state updates
    Evidence: .sisyphus/evidence/task-16-streaming.txt

  Scenario: Tool call handling
    Tool: Bash
    Steps:
      1. Run `grep -E "toolCall|executeToolCall|actionExecutor|confirm" src/screens/ChatScreen.tsx`
    Expected Result: Tool call detection and execution with confirm mode branching
    Evidence: .sisyphus/evidence/task-16-tools.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-16-tscheck.txt
  ```

  **Commit**: YES (groups with Wave 5)
  - Message: `feat(ai): add chat screen, thread list, and AI settings`
  - Files: `src/screens/ChatScreen.tsx`

- [ ] 17. Chat Thread List Screen

  **What to do**:
  - Create `src/screens/ChatThreadListScreen.tsx`
  - Screen showing all chat threads (the entry point from floating button)
  - Layout:
    - `ScreenHeader` with title "GitNotes Chat" and back button
    - "New Chat" button (primary, prominent) at top
    - Thread list (FlashList for performance):
      - Each thread: title, last message preview, timestamp, message count
      - Swipe actions: delete (red), rename (blue)
      - Tap opens thread in ChatScreen
    - Empty state: "Start your first AI chat" with sparkle icon
  - Thread management:
    - Create new thread: generate UUID, set as active, navigate to ChatScreen
    - Delete thread: confirmation alert, delete from chatStore + ChatStorageService
    - Rename thread: inline edit or modal with text input
  - Load threads from chatStore.loadThreads() on mount
  - Pull-to-refresh to reload from GitHub

  **Must NOT do**:
  - Do NOT implement chat message logic here
  - Do NOT create threads without navigating to ChatScreen

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 16, 18)
  - **Blocks**: Task 19
  - **Blocked By**: Tasks 5, 7

  **References**:

  **Pattern References**:
  - `src/screens/NotesListScreen.tsx` — List screen pattern: ScreenHeader, list with items, empty state, pull-to-refresh, search
  - `src/screens/TodoListScreen.tsx` — Swipe actions pattern

  **API/Type References**:
  - `src/stores/chatStore.ts` — loadThreads, createThread, deleteThread, renameThread
  - `src/services/ChatStorageService.ts` — loadThreadSummaries, deleteThread

  **WHY Each Reference Matters**:
  - `NotesListScreen.tsx` is the closest pattern to a thread list — it has search, filtering, pull-to-refresh, and empty state. Thread list should follow the same visual structure.

  **Acceptance Criteria**:
  - [ ] `src/screens/ChatThreadListScreen.tsx` exists
  - [ ] Thread list with title, preview, timestamp
  - [ ] New Chat button creates thread and navigates
  - [ ] Swipe to delete/rename
  - [ ] Empty state
  - [ ] Pull-to-refresh
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: Thread list renders threads
    Tool: Bash
    Steps:
      1. Run `grep -E "FlashList|threads|ChatThreadSummary" src/screens/ChatThreadListScreen.tsx`
    Expected Result: FlashList rendering thread data
    Evidence: .sisyphus/evidence/task-17-list.txt

  Scenario: CRUD actions present
    Tool: Bash
    Steps:
      1. Run `grep -E "createThread|deleteThread|renameThread|newChat|swipe" src/screens/ChatThreadListScreen.tsx`
    Expected Result: All thread management actions found
    Evidence: .sisyphus/evidence/task-17-crud.txt

  Scenario: Empty state handled
    Tool: Bash
    Steps:
      1. Run `grep -E "empty|Empty|no threads|first chat" src/screens/ChatThreadListScreen.tsx`
    Expected Result: Empty state component/message found
    Evidence: .sisyphus/evidence/task-17-empty.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-17-tscheck.txt
  ```

  **Commit**: YES (groups with Wave 5)
  - Message: `feat(ai): add chat screen, thread list, and AI settings`
  - Files: `src/screens/ChatThreadListScreen.tsx`

- [ ] 18. Settings AI Section (Disable Toggle, Model Selector, API Keys, Action Mode, Chat Repo)

  **What to do**:
  - Update `src/screens/SettingsScreen.tsx` to add a new "AI" section
  - This is the only task that modifies an existing screen
  - New section in Settings (add after existing sections, before "About" if any):
    - **AI toggle**: Master "Enable AI" toggle using Toggle component (reads/writes aiStore.isEnabled)
    - **When AI is enabled**, show sub-section:
      - **Model**: Tap to open ModelSelector modal → shows current model name, tap to change
      - **Action Mode**: Toggle between "Auto-execute" and "Confirm before action" using GroupRow with radio-like selection
      - **Chat Storage**: Shows current repo name, tap to open ChatRepoPickerModal
      - **Providers**: List of configured providers (Apple, Llama, and custom ones)
        - Each provider row: name, status (connected/downloaded), tap to edit
        - "Add Provider" button at bottom → opens ProviderConfigModal
      - **API Keys**: Shown within each provider's config (not a separate section)
  - Use existing settings UI patterns (Group, GroupRow, Toggle from ui components)
  - The entire AI section should be collapsed/hidden when isEnabled is false (except the toggle itself)

  **Must NOT do**:
  - Do NOT reorganize existing settings sections — just add new AI section
  - Do NOT break existing settings functionality

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 16, 17)
  - **Blocks**: None directly
  - **Blocked By**: Tasks 4, 14, 15

  **References**:

  **Pattern References**:
  - `src/screens/SettingsScreen.tsx:37-100` — Existing settings structure: Section titles, GroupRow entries, Toggle usage, modal triggers
  - `src/components/ui/Group.tsx` — GroupRow for settings list items
  - `src/components/ui/Toggle.tsx` — Toggle switch component

  **API/Type References**:
  - `src/stores/aiStore.ts` — isEnabled, actionMode, selectedModelId, providers, chatRepo
  - `src/components/ai/ModelSelector.tsx` — Model selection modal
  - `src/components/ai/ProviderConfigModal.tsx` — Provider add/edit modal
  - `src/components/ai/ChatRepoPickerModal.tsx` — Chat repo selection

  **WHY Each Reference Matters**:
  - `SettingsScreen.tsx` shows the exact GroupRow pattern used for settings. New AI settings MUST use the same visual structure to blend seamlessly.

  **Acceptance Criteria**:
  - [ ] AI section added to SettingsScreen
  - [ ] Master "Enable AI" toggle present
  - [ ] When enabled: model selector, action mode, chat storage, providers visible
  - [ ] When disabled: only toggle visible
  - [ ] Provider list shows Apple + Llama + custom providers
  - [ ] "Add Provider" opens ProviderConfigModal
  - [ ] Existing settings unchanged
  - [ ] `yarn ts:check` passes

  **QA Scenarios**:
  ```
  Scenario: AI section added to settings
    Tool: Bash
    Steps:
      1. Run `grep -E "AI|aiStore|Enable AI" src/screens/SettingsScreen.tsx`
    Expected Result: AI section with toggle and aiStore import found
    Evidence: .sisyphus/evidence/task-18-section.txt

  Scenario: Toggle hides/shows sub-settings
    Tool: Bash
    Steps:
      1. Run `grep -E "isEnabled|model|provider|action|chatRepo" src/screens/SettingsScreen.tsx`
    Expected Result: Conditional rendering based on isEnabled
    Evidence: .sisyphus/evidence/task-18-toggle.txt

  Scenario: Existing settings unmodified
    Tool: Bash
    Steps:
      1. Run `grep -E "GitHub|Theme|token|sync|Clear" src/screens/SettingsScreen.tsx`
    Expected Result: All existing settings sections still present
    Evidence: .sisyphus/evidence/task-18-existing.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-18-tscheck.txt
  ```

  **Commit**: YES (groups with Wave 5)
  - Message: `feat(ai): add chat screen, thread list, and AI settings`
  - Files: `src/screens/SettingsScreen.tsx`

- [ ] 19. App Navigator Integration (Routes + Floating Button + First-Use Flow)

  **What to do**:
  - Update `src/navigation/AppNavigator.tsx`:
    - Import ChatScreen and ChatThreadListScreen
    - Add Stack.Screen entries for `ChatThreadList` and `ChatScreen` (headerShown: false)
    - Wrap the NavigationContainer content with the FloatingAIButton as an overlay
    - The floating button must render ON TOP of all screens (use absolute positioning with high zIndex)
  - Update `src/navigation/types.ts` linking config:
    - Add routes for ChatThreadList and ChatScreen to the linking config
  - First-use flow:
    - When floating button is tapped and no chat repo is configured (aiStore.chatRepoOwner is null):
      - Show ChatRepoPickerModal instead of navigating
      - After repo is selected, navigate to ChatThreadList
    - When chat repo IS configured, navigate directly to ChatThreadList
  - Wrap the app with any necessary providers (if aiStore/chatStore need context providers)
  - Verify deep linking works for chat routes

  **Must NOT do**:
  - Do NOT add a tab for AI chat — it's accessed via floating button only
  - Do NOT modify the tab navigator
  - Do NOT break existing navigation flows

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 (after all previous waves)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 3, 11, 16, 17

  **References**:

  **Pattern References**:
  - `src/navigation/AppNavigator.tsx:47-107` — Stack.Navigator setup: screen definitions, linking config, GestureHandlerRootView wrapper
  - `src/navigation/TabNavigator.tsx` — Tab navigator for reference (don't modify)

  **API/Type References**:
  - `src/navigation/types.ts` — RootStackParamList with new ChatThreadList and ChatScreen routes
  - `src/components/ai/FloatingAIButton.tsx` — Button component to render as overlay
  - `src/screens/ChatScreen.tsx` — Chat screen to register
  - `src/screens/ChatThreadListScreen.tsx` — Thread list screen to register
  - `src/components/ai/ChatRepoPickerModal.tsx` — First-use modal

  **WHY Each Reference Matters**:
  - `AppNavigator.tsx` is the single source of truth for all routing. New screens must be registered here following the exact same Stack.Screen pattern.
  - The floating button must be positioned as an overlay at this level to appear on all screens.

  **Acceptance Criteria**:
  - [ ] ChatThreadList and ChatScreen routes registered in AppNavigator
  - [ ] FloatingAIButton rendered as overlay over all screens
  - [ ] First-use flow shows ChatRepoPickerModal when no repo configured
  - [ ] Navigation from floating button to thread list works
  - [ ] Deep linking config updated for chat routes
  - [ ] Existing navigation untouched
  - [ ] `yarn ts:check` passes
  - [ ] `yarn test` passes

  **QA Scenarios**:
  ```
  Scenario: Chat routes registered
    Tool: Bash
    Steps:
      1. Run `grep -E "ChatThreadList|ChatScreen" src/navigation/AppNavigator.tsx`
    Expected Result: Both screens registered as Stack.Screen
    Evidence: .sisyphus/evidence/task-19-routes.txt

  Scenario: Floating button overlay
    Tool: Bash
    Steps:
      1. Run `grep -E "FloatingAIButton|absolute|zIndex" src/navigation/AppNavigator.tsx`
    Expected Result: FloatingAIButton imported and rendered as overlay
    Evidence: .sisyphus/evidence/task-19-overlay.txt

  Scenario: First-use repo check
    Tool: Bash
    Steps:
      1. Run `grep -E "chatRepoOwner|ChatRepoPicker|first.use" src/navigation/AppNavigator.tsx`
    Expected Result: First-use repo check before navigation
    Evidence: .sisyphus/evidence/task-19-firstuse.txt

  Scenario: Existing routes unchanged
    Tool: Bash
    Steps:
      1. Run `grep -E "MainTabs|NoteEditor|CanvasEditor|PdfViewer|FileViewer|ImageViewer|VideoViewer" src/navigation/AppNavigator.tsx`
    Expected Result: All existing routes still present
    Evidence: .sisyphus/evidence/task-19-existing.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run `yarn ts:check`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-19-tscheck.txt

  Scenario: Tests pass
    Tool: Bash
    Steps:
      1. Run `yarn test`
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-19-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(ai): integrate AI chat into app navigation with floating button`
  - Files: `src/navigation/AppNavigator.tsx`, `src/navigation/types.ts`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `yarn ts:check` + `yarn test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration. Test edge cases: offline, no model available, empty repo, invalid API key. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 match. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(ai): add AI dependencies and type definitions` - package.json, src/models/Chat.ts, src/models/AIProvider.ts, src/navigation/types.ts, src/stores/aiStore.ts, src/stores/chatStore.ts
- **Wave 2**: `feat(ai): add AI, chat storage, and context services` - src/services/AIService.ts, src/services/ChatStorageService.ts, src/services/ContextService.ts
- **Wave 3**: `feat(ai): add AI tools and action executor` - src/services/ai/tools.ts, src/services/ai/systemPrompt.ts, src/services/ai/actionExecutor.ts
- **Wave 4**: `feat(ai): add chat UI components` - src/components/ai/*
- **Wave 5**: `feat(ai): add chat screens and settings section` - src/screens/ChatScreen.tsx, src/screens/ChatThreadListScreen.tsx, updated SettingsScreen.tsx
- **Wave 6**: `feat(ai): integrate AI chat into app navigation` - updated AppNavigator.tsx

---

## Success Criteria

### Verification Commands
```bash
yarn ts:check          # Expected: no errors
yarn test              # Expected: all tests pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Floating button appears and is draggable
- [ ] Chat UI works with streaming responses
- [ ] AI can create/edit/delete notes and todos
- [ ] Context picker works for files, folders, repos
- [ ] Chat threads persist to GitHub repo
- [ ] First-use repo picker appears
- [ ] AI disable toggle hides all AI features
- [ ] Model selection works (on-device + cloud)
- [ ] API key management works for custom providers
- [ ] Offline auto-fallback works
