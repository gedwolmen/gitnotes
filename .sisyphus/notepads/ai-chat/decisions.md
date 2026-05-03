# AI Chat Feature - Decisions

## 2026-05-02 Planning
- callstackincubator/ai <=0.11 compatible with AI SDK v5, >=0.12 needs v6
- Apple Foundation Models: iOS 26+ physical device only, not simulator
- Llama GGUF: requires model download from HuggingFace (~2GB for SmolLM3-3B)
- @ai-sdk/openai-compatible: createOpenAICompatible({ name, baseURL, apiKey }) for any provider
- API keys must use expo-secure-store (matching GitHub token pattern)
- Chat threads stored as JSON in .gitnotes/chats/ in user's selected GitHub repo
- Existing stores follow pattern: State + Actions interfaces, create() with set/get
- Chat storage index lives at `.gitnotes/chats/index.json` with `{ threads: ChatThreadSummary[] }`, and each thread lives at `.gitnotes/chats/{threadId}.json`.
- `initializeChatStorage` should create both `.gitkeep` and `index.json`, tolerating already-exists responses from the GitHub Contents API.
- AI chat tool definitions will live under `src/services/ai/` with no store access in `execute`; actual mutations are deferred to a later action executor so the current layer only validates and echoes tool inputs.
- `ChatScreen` should load the current thread by `threadId` from `chatStore`, fall back to the configured AI chat repo when the active thread is absent, and avoid thread-management responsibilities beyond message updates/persistence.
- Confirm mode stays inline in the conversation via a pending confirmation card driven by `executeToolCall(..., 'confirm')`, while Apply re-runs the same tool in auto mode so the screen never mutates note/todo stores directly.
- Keep AI chat entry out of tab navigation; register `ChatThreadList`/`ChatScreen` only in the root stack and mount `FloatingAIButton` plus `ChatRepoPickerModal` as navigator-level overlays.
- Use the chat repo from `aiStore` as the source of truth for AI context browsing, with `GitHubService.getTreeRecursive()` providing the file/folder lists shown in the modal.

## 2026-05-03
- Added `classifyHref` as a pure utility so link routing rules are unit-testable outside the renderer.
- Kept external `http(s)`, `mailto:`, and `tel:` links on the native platform via `Linking.openURL` instead of adding in-app web handling.
- Kept renderer bug coverage in a dedicated `__tests__/renderer-pipeline.test.ts` regression file so markdown and Neorg pipeline fixes for issue #423 stay exercised together.
