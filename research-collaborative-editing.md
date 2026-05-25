# Research: Collaborative Editing with CRDTs

## Issue: #767 - Collaborative editing support

## CRDT Options

### 1. Yjs (Recommended)

- **Pros**: Industry standard, widely used, React bindings (yjs/react), small bundle (no WASM), works offline, many providers (WebRTC, WebSocket, etc.)
- **Cons**: Steeper learning curve for advanced features
- **React Native Support**: Via `yjs` + custom provider

### 2. Automerge

- **Pros**: Stores full history, easier data model, good for git-like workflows
- **Cons**: Larger bundle (WASM), more memory usage
- **React Native Support**: Via `@automerge/automerge` + React bindings

### 3. Loro (Newer)

- **Pros**: Best performance benchmarks, modern implementation
- **Cons**: Very new (2024), less community support, WASM required
- **React Native Support**: Limited/emerging

## Recommendation for gitnotes

**Yjs** is recommended because:

1. Gitnotes already uses git for versioning - Yjs CRDTs complement this well
2. Small bundle size matters for mobile
3. Mature ecosystem with proven React Native support
4. Works offline-first (like gitnotes)

## Implementation Complexity

This is a **LARGE** feature requiring:

1. **Architecture**:
   - Redesign note storage to use Yjs document structure
   - Create CRDT provider for syncing with Git backend
   - Handle merge conflicts gracefully

2. **UI**:
   - Presence indicators (who's editing)
   - Conflict resolution UI
   - Real-time cursor positions

3. **Backend**:
   - WebSocket/WebRTC signaling server (or use existing GitHub WebSocket?)
   - Sync protocol design

4. **Testing**:
   - E2E tests for concurrent editing
   - Conflict resolution tests
   - Offline/online transitions

## Suggested Approach

1. Start with a **minimal viable collaborative editing** using Yjs + y-websocket
2. Use GitHub's real-time features if available, or a simple WebSocket server
3. Add conflict resolution UI incrementally

## Time Estimate

This is a multi-week effort for a single developer. Recommend:

- Breaking into smaller issues
- Starting with a spike/prototype
- Getting user feedback early

## Related Issues

- #759 (canvas rewrite) already uses some gesture coordination patterns that could inform this
- GitNotes' git-based storage could leverage CRDT merge semantics

## References

- Yjs: https://yjs.dev/
- y-websocket: https://github.com/yjs/y-websocket
- yjs/react: https://github.com/yjs/yjs-react
- Automerge: https://automerge.org/
