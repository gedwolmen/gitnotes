# AI Chat Feature - Learnings

- Keep chat and provider model types as pure named-export interfaces/types only; no helper/runtime logic needed for this feature.
- Cross-model references should import `AIContextItem` from `AIProvider.ts` to keep shared context shapes centralized.
- Added chat routes only to `ProductionStackParamList`; no tab or global navigation typing changes were needed.
- React Native AI v0.12 targets AI SDK v6; for this Expo app, pinning `ai@5` requires `@react-native-ai/apple@0.11.0`, `@react-native-ai/llama@0.10.0`, and `llama.rn@0.10.1`.
- Expo polyfills required by the React Native AI docs are `@ungap/structured-clone` and `@stardazed/streams-text-encoding`.
- Chat store mirrors the note store pattern with separate State and Actions interfaces, `create()` + `set/get`, and lightweight thread summaries derived from the active thread.
- Chat storage is adapter-driven in the store; only load/delete flows depend on the adapter so streaming updates stay in-memory until screens decide when to persist.
- AI settings store persists non-secret settings in AsyncStorage under `ai-settings` and stores provider API keys separately in expo-secure-store with `ai-provider-key-${providerId}` keys.
- AI settings hydration should merge saved settings with default Apple/Llama providers so missing default fields/providers are restored without losing saved custom providers.
- AI SDK `streamText(...).fullStream` in this branch emits `text-delta` chunks, so a React Native streaming service should yield `textDelta` and serialize tool events separately for callers that handle tool execution.
- `@react-native-ai/llama@0.10.0` exposes download state through `LlamaEngine.isDownloaded(modelId)` and per-model lifecycle methods like `download()` and `prepare()` on `llama.languageModel(modelId)`.
- Context aggregation for AI chat can stay store-driven: fetch GitHub contents via the Contents API with the saved PAT, skip known binary extensions before requesting files, and enforce byte-based caps with `TextEncoder`/`TextDecoder` helpers.
- Chat storage can use the GitHub Contents API directly with axios plus `Authorization: token ${token}` from the saved PAT, while `GitHubService.isAuthenticated()` remains the gate for access.
- Cache chat index per repo (`chat-index-${owner}-${repo}`) and individual threads per id (`chat-thread-${threadId}`), but keep GitHub as the source of truth and only fall back to cache on non-404 fetch failures.
- AI SDK v5 tool definitions in this branch type-check with `inputSchema` rather than `parameters`; exporting separate Zod schema constants preserves reusable parameter definitions while execute functions can remain passthrough validators.

### UI/Neumorphic Implementations
- Utilized shared UI components from `src/components/ui` (`Modal`, `Button`, `Input`, `Surface`) to ensure consistent neumorphic styling.
- Extracted repo paths correctly into `owner` and `name` depending on how repositories are accessed via `repoStore`.
- `SettingsScreen` can layer new AI controls with the shared `Group`/`GroupRow` settings primitives without touching the legacy GitHub/Data/About section structure.
- `ChatScreen` can keep chat persistence screen-owned by wiring the chat store adapter to `ChatStorageService` locally, then calling `saveThread()` only after a stream or confirmation action completes.
- Tool events from `AIService.streamChatResponse()` arrive as serialized JSON strings; buffering `tool-call-delta` chunks by `toolCallId` gives enough data to reconstruct arguments for `actionExecutor` without blocking text streaming.
- The existing `ChatInputBar` already owns attached-context chip rendering, so `ChatScreen` only needs to manage picker visibility plus the selected `AIContextItem[]` state.
- `AppNavigator` can deliver first-use chat setup without touching `FloatingAIButton` by watching navigation state: when `ChatThreadList` becomes active and no chat repo is configured, show `ChatRepoPickerModal` as a top-level overlay.
- Floating AI overlays that call `useNavigation()` must live inside `NavigationContainer`; wrapping the stack and FAB in an inner flex view preserves layout while avoiding runtime crashes.
- Context pickers can reuse the authenticated GitHub tree API directly for file/folder selection instead of relying on placeholder copy or store-only repo metadata.

- Plan-compliance review needs to verify behavior, not just file existence: route overlays rendered outside `NavigationContainer`, placeholder context tabs, and local-only rename flows can still pass typecheck/tests while missing the requested user flow.

## 2026-05-03
- Markdown preview links need target classification before routing; raw `Linking.openURL` breaks internal note navigation and fragment scrolling behavior.
- Relative note links should resolve against the current note file path, while stored note lookups should normalize away leading slashes because folder selections use `/path` but synced note `filePath` values do not.
- Markdown fenced code rendering can stay lightweight: a plain `<Text>` language label above the existing code body fixes dropped language metadata without adding syntax highlighting.
- Neorg inline parsing is safer when URL-shaped substrings are reserved before italic matching and repeated parses are cached behind a memoized parser function.
- Neorg list indentation needs adaptive parsing: the first indented space-based sibling should define the indent width, while tabs should count as one nesting level.
- Custom template persistence can stay isolated from note storage by using dedicated AsyncStorage keys for template blobs and pin IDs, with a small Zustand store handling merge/sort behavior.
- Settings rows can reuse the existing `settingItem` visual pattern for new affordances without introducing new navigation scaffolding in this branch.
