# Screens & Navigation

> All screens, navigation hierarchy, and deep link paths. See [Architecture](./architecture.md) for context.

## Navigation Hierarchy

```
AppNavigator (Native Stack Navigator)
│
├── OnboardingScreen              # First-run onboarding flow
├── MainTabs (TabNavigator)       # Bottom tab navigator (5 tabs)
│   ├── HomeTab → HomeScreen
│   ├── NotesTab → NotesListScreen
│   ├── ExploreTab → ExploreScreen
│   ├── TodosTab → TodoListScreen
│   ├── SettingsTab → SettingsScreen
│   └── CanvasList → CanvasListScreen  (hidden tab)
│
├── NoteEditorScreen              # Stack screen — note/:noteId
├── CanvasEditorScreen            # Stack screen — canvas/:canvasId
├── ChatThreadListScreen          # Stack screen — chat
├── ChatScreen                   # Stack screen — chat/:threadId
├── SyncStatusScreen             # Stack screen
├── AddReminderScreen            # Stack screen
├── TemplateManagerScreen         # Stack screen
├── RenderStyleSettingsScreen    # Stack screen
├── RenderStyleEditorScreen      # Stack screen
├── GraphViewScreen              # Stack screen
├── PaywallScreen               # Stack screen (interstitial or direct)
├── ThoughtDumpScreen           # Stack screen — thought-dump
├── ImageViewerScreen            # Stack screen
├── FileViewerScreen             # Stack screen
├── PdfViewerScreen             # Stack screen
├── VideoViewerScreen            # Stack screen
├── ExploreCommitScreen          # Stack screen
├── ExploreDiffScreen            # Stack screen
├── ExploreFileScreen            # Stack screen
└── NeumorphicGallery           # __dev__/neumorphic (dev only)
```

## Deep Linking

GitNotēs uses the custom scheme `gitnotes://` for deep links.

### URL Structure

| Route | URL Pattern | Example |
|-------|------------|---------|
| Note | `gitnotes://note/:noteId` | `gitnotes://note/1699876543-abc123` |
| Canvas | `gitnotes://canvas/:canvasId` | `gitnotes://canvas/1699876543-def456` |
| Chat thread list | `gitnotes://chat` | `gitnotes://chat` |
| Chat thread | `gitnotes://chat/:threadId` | `gitnotes://chat/1699876543-ghi789` |
| Home | `gitnotes://home` | `gitnotes://home` |
| Notes list | `gitnotes://notes` | `gitnotes://notes` |
| Explore | `gitnotes://explore` | `gitnotes://explore` |
| Settings | `gitnotes://settings` | `gitnotes://settings` |
| Thought dump | `gitnotes://thought-dump` | `gitnotes://thought-dump` |

> **Note:** Deep linking to the tab bar screens (HomeTab, NotesTab, etc.) is not supported via custom scheme. Universal links (`https://gitnotes.app/...`) require associated domains entitlement configuration — see [Architecture](./architecture.md).

### Actual Route Param Types

The canonical route param types are in `src/navigation/types.ts`:

| Screen | Route Param Type |
|--------|-----------------|
| `NoteEditor` | `{ noteId?, format?, initialTitle?, initialContent?, initialTags?, repo?, branch?, folderPath?, anchor? }` |
| `CanvasEditor` | `{ canvasId?, canvasWidth?, canvasHeight?, canvasTitle? }` |
| `ChatScreen` | `{ threadId: string }` |
| `ThoughtDump` | `{ openVoiceOnMount? }` |
| `Explore` | `{ repoId? }` |
| `ExploreDiff` | `{ repoId: string; path: string }` |
| `ExploreCommit` | `{ repoId: string; commitId: string }` |
| `ExploreFile` | `{ repoId: string; path: string }` |
| `ExploreConflict` | `{ repoId: string }` |
| `PdfViewer` | `{ owner: string; repo: string; branch?; path: string; title? }` |

## Screens

### HomeScreen

**Purpose:** Dashboard with quick access to recent notes, daily quote, and sync status.

**Key components:**
- `BentoRecent` — bento-grid layout of recent notes
- `DailyQuoteCard` — philosopher quote from `DailyQuoteService`
- `QuickAccessShelf` — pinned/favorite notes
- `FloatingGitButton` — floating sync button

---

### NotesListScreen

**Purpose:** Browse and search all notes in the selected repo/folder.

**Key components:**
- `NoteCard` — note preview card with title, excerpt, tags, color
- `NotesFilterModal` — filter by folder, tag, color, date
- `NotesViewModePicker` — list vs grid view toggle
- `ActiveFilterStrip` — shows active filters
- `BulkActionBar` — bulk delete, move, tag operations

**Navigation:** Tapping a note → `NoteEditorScreen`. Long-press → context menu.

---

### NoteEditorScreen

**Purpose:** Full note editing with toolbar, tag input, and AI assist.

**Key components:**
- `NoteEditorForm` — main editor (Markdown input)
- `EditorToolbar` — formatting toolbar (bold, italic, heading, list, code)
- `EditorHeader` — title input, folder breadcrumb
- `MarkdownBody` — rendered Markdown preview pane
- `TagInput` — tag editor
- `BacklinksSection` — notes that link to this note
- `FloatingAIButton` — AI assist trigger

**States:** Editing, Preview, Split (edit + preview side-by-side)

---

### TodoListScreen

**Purpose:** Browse, filter, and manage todos.

**Key components:**
- `TodoCard` — todo with checkbox, title, due date, tags
- `TodoEditorModal` — create/edit todo
- `TodosListHeader` — filter tabs (All, Today, Upcoming, Overdue)

---

### CanvasListScreen

**Purpose:** Browse all canvas documents.

**Key components:**
- `CanvasThumbnail` — grid thumbnail of canvas
- `CanvasPreview` — preview on tap
- `CanvasPickerModal` — embed canvas picker in note editor

**Navigation:** Tapping → `CanvasEditorScreen`

---

### CanvasEditorScreen

**Purpose:** Infinite canvas with tile-based layout, drawing, and AI vision.

**Key components:**
- Sparse tile canvas (handled by native Skia/canvas layer)
- `AtlasComposer` — tile composition
- `HotspotGrid` — tappable regions
- AI vision toolbar (OCR, object detection)

---

### ChatScreen

**Purpose:** AI chat with context from the current note or repo.

**Key components:**
- `ChatMessageBubble` — user and AI message bubbles
- `ChatInputBar` — message input with send button
- `FloatingAIHubMenu` — AI provider picker
- `ContextPickerModal` — pick which note/repo to chat about
- `ModelSelector` — pick AI model

---

### ChatThreadListScreen

**Purpose:** List all AI chat threads.

**Key components:**
- `ChatThreadCard` — thread preview with last message, timestamp
- `ChatThreadContextMenu` — delete, rename thread

---

### ExploreScreen

**Purpose:** Git repository explorer — view commits, diffs, files, and pull requests.

**Sections:**
- `CommitsSection` — recent commits list
- `ChangesSection` — unstaged/staged changes
- `FilesSection` — repo file tree
- `PullRequestsSection` — open PRs (GitHub only)
- `ConflictsSection` — unresolved merge conflicts

---

### ExploreCommitScreen

**Purpose:** View a single commit — message, author, changed files, diff.

**Route params:** `{ repoId: string; commitId: string }`

**Navigation:** Tapped from `ExploreScreen` commit list.

---

### ExploreDiffScreen

**Purpose:** View diff between two commits or branch state.

**Route params:** `{ repoId: string; path: string }` — `path` is the file path

**Navigation:** Tapped from `ExploreScreen` changes list.

---

### ExploreFileScreen

**Purpose:** View a file at a specific commit or branch state.

**Route params:** `{ repoId: string; path: string }`

**Navigation:** Tapped from `ExploreScreen` file tree.

---

### SettingsScreen

**Purpose:** App settings hub.

**Sections:**
- Account management (`AccountsContext`)
- GitHub connection (`GitHubAuthContext`)
- Theme selection (`ThemeContext`)
- Sync settings (`ForegroundSyncSettings`)
- Notification preferences
- Pro/paywall access (`PaywallScreen`)
- Biometric lock toggle (`BiometricLockContext`)
- Language (i18n)

---

### SyncStatusScreen

**Purpose:** Detailed sync status — pending changes, last sync time, push/pull controls.

**Navigation:** From `SettingsScreen` or floating git button.

---

### OnboardingScreen

**Purpose:** First-run setup — clone a repo or create a new one.

**Flow:**
1. Welcome + feature intro
2. GitHub sign-in (optional)
3. Clone existing repo or create new
4. Initial sync
5. Done → `HomeScreen`

---

### PaywallScreen

**Purpose:** Pro subscription purchase UI.

**Components:**
- `PaywallPlanGrid` — monthly/yearly/lifetime plan cards
- `PaywallFeatureGrid` — feature comparison (free vs Pro)
- Purchase flow handled by `RevenueCatService`
- Restore purchases button

---

### GraphViewScreen

**Purpose:** Note/wiki-link graph visualization.

---

### RenderStyleSettingsScreen / RenderStyleEditorScreen

**Purpose:** Configure how notes are rendered (Markdown, rich text, plaintext).

---

### TemplateManagerScreen

**Purpose:** Create and manage note templates.

**Key components:**
- `TemplateListItem` — template preview
- `TemplateEditorModal` — create/edit template

---

### ThoughtDumpScreen

**Purpose:** Rapid capture mode — voice or text input that dumps into a note as stream-of-consciousness.

**Flow:** User talks/types → captured as draft note → saved to selected repo.

---

### ImageViewerScreen / FileViewerScreen / PdfViewerScreen / VideoViewerScreen

**Purpose:** Full-screen viewer for attachments.

**Supported formats:**
- Images: JPEG, PNG, GIF, WebP, HEIC
- Files: generic file preview
- PDF: multi-page PDF renderer
- Video: MP4, MOV (native playback)

---

### BiometricLockScreen

**Purpose:** App lock screen shown when app returns from background.

**Trigger:** `BiometricLockContext` — enabled in settings.

---

## See Also

- [Navigation types](../navigation/types.ts) — TypeScript type definitions for route params
- [Architecture](./architecture.md) — Context
