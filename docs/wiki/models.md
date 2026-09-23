# Models Reference

> All TypeScript model interfaces. See [Architecture](./architecture.md) for how models relate to stores and services.

## Note

**File:** `src/models/Note.ts`

```typescript
interface Note {
  id: string;                    // Client-generated: Crypto.randomUUID() or timestamp+random fallback
  title: string;
  content: string;                // Raw content (Markdown, Neorg, Org, JSON)
  tags: string[];
  color?: NoteColor;              // 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray'
  repo?: string;                 // 'owner/repo' format
  branch?: string;                // git branch name
  commit?: string;               // git commit SHA of last save
  folderPath?: string;            // e.g. 'Work/Projects' (no leading slash)
  filePath?: string;             // Full path relative to repo root: 'Work/Projects/my-note.md'
  isPinned?: boolean;
  format?: NoteFormat;           // 'markdown' | 'neorg' | 'org' | 'pdf' | 'json'
  // NOTE: 'pdf' is retained in the type for legacy records that may exist in storage.
  // New PDF files are NOT imported as text notes (PDF was removed from NOTE_EXTS in RepoPullService).
  // Legacy PDF notes are searchable by title and tags only — body content is not scanned.
  attachments?: Attachment[];
  accountId?: string;             // Which account's repo this note belongs to
  createdAt: number;             // Unix timestamp ms
  updatedAt: number;              // Unix timestamp ms
}
```

**NoteColor:** `'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray'`

**NoteFormat:** `'markdown' | 'neorg' | 'org' | 'pdf' | 'json'`

> **Legacy PDF note behaviour:** `'pdf'` is kept in the type to support records created by earlier versions of the app. New PDF files are **not** imported as text notes (the `pdf` extension was removed from `NOTE_EXTS` in `RepoPullService`). Legacy `'pdf'` notes are searchable by title and tags but their binary body content is skipped by `filterNotesBySearch` (the `note.format !== 'pdf'` guard).

**Key functions:** `createNote()`, `updateNote()`, `sortNotesByUpdated()`, `sortNotesWithPinnedFirst()`, `filterNotesBySearch()`, `filterNotesByFolder()`, `getNoteFileExtension()`

---

## Todo

**File:** `src/models/Todo.ts`

```typescript
interface Todo {
  id: string;
  title: string;
  content?: string;              // Optional extended description
  completed: boolean;
  dueDate?: number;             // Unix timestamp ms
  repo?: string;
  branch?: string;
  filePath?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}
```

---

## Canvas

**File:** `src/models/Canvas.ts`

Visual Canvas — infinite canvas with drawing, shapes, text, charts, and images.

```typescript
interface Canvas {
  id: string;
  title: string;
  scene: CanvasScene;           // Scene graph with elements
  folderPath?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  accountId?: string;
  lastPulledScene?: string;     // Serialized scene for edit detection
}

interface CanvasScene {
  version: number;
  width: number;
  height: number;
  background: string;
  elements: CanvasElement[];     // Stroke, Shape, Text, Chart, Image
}

type CanvasElement = CanvasStroke | CanvasShape | CanvasText | CanvasChart | CanvasImage;

interface CanvasStroke {
  type: 'stroke';
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  width: number;
  points: { x: number; y: number }[];
  animation?: CanvasAnimation;
}

interface CanvasShape {
  type: 'shape';
  id: string;
  shape: 'line' | 'rect' | 'ellipse' | 'diamond' | 'roundRect' | 'arrow';
  color: string;
  fillColor?: string;
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  animation?: CanvasAnimation;
}

interface CanvasText {
  type: 'text';
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  animation?: CanvasAnimation;
}

interface CanvasChart {
  type: 'chart';
  id: string;
  chartType: 'bar' | 'line' | 'pie';
  title: string;
  labels: string[];
  values: number[];
  x: number;
  y: number;
  width: number;
  height: number;
  animation?: CanvasAnimation;
}

interface CanvasImage {
  type: 'image';
  id: string;
  data: string;                 // Base64 JPEG
  mimeType: 'image/jpeg';
  x: number;
  y: number;
  width: number;
  height: number;
  animation?: CanvasAnimation;
}

interface CanvasAnimation {
  type: 'pulse' | 'fade' | 'spin' | 'translate';
  duration: number;
  loop: boolean;
}
```

> **Stale info removed:** The obsolete `tiles: CanvasTile[]` and `hotspots: Hotspot[]` schema (from the original sparse-tile canvas) no longer exists. The current canvas uses `scene: CanvasScene` with `elements: CanvasElement[]`.

---

## Diagram

**File:** `src/models/Diagram.ts`

ASCII Diagram — Pro-only box-drawing diagrams stored as `.td.json` files under `diagrams/`.

```typescript
interface Diagram {
  id: string;
  title: string;
  document: DrawDocument;        // The ASCII drawing document
  folderPath?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  accountId?: string;
  lastPulledDocument?: string;  // Serialized doc for edit detection
}

interface DrawDocument {
  version: number;
  objects: DrawObject[];         // Box, Line, Elbow, Paint, Text
}

type DrawObject = BoxObject | LineObject | ElbowObject | PaintObject | TextObject;

interface BoxObject {
  type: 'box';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: BoxStyle;
  label?: string;
}

interface LineObject {
  type: 'line';
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: LineStyle;
}

interface ElbowObject {
  type: 'elbow';
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  orientation: ElbowOrientation;
  style: LineStyle;
}

interface PaintObject {
  type: 'paint';
  id: string;
  color: InkColor;
  thickness: number;
  points: Point[];
}

interface TextObject {
  type: 'text';
  id: string;
  x: number;
  y: number;
  content: string;
  style: TextBorderMode;
}

type BoxStyle = 'none' | 'single' | 'double' | 'underline';
type LineStyle = 'solid' | 'dashed' | 'dotted';
type ElbowOrientation = 'horizontal' | 'vertical';
type InkColor = 'black' | 'red' | 'green' | 'blue' | 'yellow' | 'magenta' | 'cyan' | 'white';
type TextBorderMode = 'none' | 'single' | 'double';
```

> **Key invariants:**
> - Diagrams are **Pro-only** — creation and editing gated by `useProScreenGuard('DiagramEditor')`
> - Diagrams use type `diagram`, format `td`, stored as `.td.json` under `diagrams/` in the repo
> - Canvas uses type `canvas`, format `canvas` (JSON), stored as `.canvas` under `canvases/`
> - The two document types are isolated: `.td.json` files are never processed as canvases, and vice versa

---

## Chat

**File:** `src/models/Chat.ts`

```typescript
interface Chat {
  id: string;
  threadId: string;
  messages: ChatMessage[];
  repo?: string;                 // Repo context for this chat
  branch?: string;
  createdAt: number;
  updatedAt: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;               // Which AI model was used
  createdAt: number;
}
```

---

## AIProvider

**File:** `src/models/AIProvider.ts`

```typescript
interface AIProvider {
  id: string;
  name: string;                  // 'Anthropic' | 'OpenAI' | 'Ollama' | 'AppleIntelligence'
  apiKey?: string;
  baseURL?: string;             // Custom endpoint for OpenAI-compatible providers
  model: string;                // e.g. 'claude-sonnet-4-20250514'
  isActive: boolean;
}
```

---

## Attachment

**File:** `src/models/Attachment.ts`

```typescript
interface Attachment {
  id: string;
  noteId: string;
  filename: string;              // Original filename
  mimeType: string;             // e.g. 'image/png'
  size: number;                 // bytes
  localPath?: string;           // Local cache path
  remotePath?: string;          // Git LFS pointer or CDN URL
  createdAt: number;
}
```

---

## Folder

**File:** `src/models/Folder.ts`

```typescript
interface Folder {
  id: string;
  name: string;                 // Display name, not the full path
  path: string;                 // Full path: 'Work/Projects/ClientA'
  repo: string;
  branch: string;
  parentPath?: string;           // Parent folder path
  noteCount: number;            // Cached count of notes in this folder
}
```

---

## Reminder

**File:** `src/models/Reminder.ts`

```typescript
interface Reminder {
  id: string;
  noteId?: string;              // Associated note (optional)
  title: string;
  dueDate: number;             // Unix timestamp ms
  repeatInterval?: 'daily' | 'weekly' | 'monthly';
  isCompleted: boolean;
  createdAt: number;
}
```

---

## ThoughtDump

**File:** `src/models/ThoughtDump.ts`

```typescript
interface ThoughtDump {
  id: string;
  content: string;              // Raw captured content
  targetRepo?: string;
  targetBranch?: string;
  targetFolder?: string;         // Where to save as a note
  createdAt: number;
}
```

---

## NeorgDocument

**File:** `src/models/NeorgDocument.ts`

```typescript
interface NeorgDocument {
  version: string;              // Neorg format version
  paragraphs: NeorgContent[];
  headings: NeorgHeading[];
  lists: NeorgList[];
  links: NeorgLink[];
  todoItems: NeorgTodoItem[];
  tags: string[];
}

interface NeorgHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  anchor?: string;
}

interface NeorgList {
  ordered: boolean;
  items: string[];
}

interface NeorgTodoItem {
  status: 'pending' | 'done' | 'pending_on' | 'running';
  content: string;
}
```

---

## NeorgContent

**File:** `src/models/NeorgContent.ts`

```typescript
interface NeorgContent {
  type: 'paragraph' | 'quote' | 'code' | 'divider';
  content: string;
  marks?: NeorgMark[];        // Bold, italic, code, etc.
}

interface NeorgMark {
  type: 'bold' | 'italic' | 'code' | 'underline' | 'strike';
  from: number;               // Start offset
  to: number;                 // End offset
}
```

---

## NeorgLink

**File:** `src/models/NeorgLink.ts`

```typescript
interface NeorgLink {
  type: 'wiki' | 'external' | 'anchor';
  target: string;              // 'Note Title' or 'https://...'
  displayText?: string;        // Custom display text
}
```

---

## NeorgInline

**File:** `src/models/NeorgInline.ts`

```typescript
interface NeorgInline {
  type: 'text' | 'mark' | 'link' | 'inlineMath' | 'inlineCode';
  content: string;
  from: number;
  to: number;
}
```

---

## See Also

- [Stores](./stores.md) — Zustand stores that hold model instances
- [Services](./services.md) — Services that create/update models
- [Architecture](./architecture.md) — Data flow
