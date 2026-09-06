# Note File Format

> How notes are stored on disk — file format, frontmatter, folder structure, and the DocumentIndex SQLite layer. See [Architecture](./architecture.md) for context.

## File Format

Every note is a **plain file** on disk. The file IS the source of truth. There is no separate database for content.

```
---
id: 1699876543-abc123
title: My First Note
type: note
tags: [work, ideas]
folder: Work/Projects
isPinned: false
color: blue
createdAt: 2024-01-15T10:30:00.000Z
updatedAt: 2024-01-15T14:22:00.000Z
---

# My First Note

This is the note body. It goes here after the frontmatter block.
```

**Frontmatter** is YAML-ish (custom parser, not full YAML). The delimiter is `---` on its own line.

## Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Client-generated unique ID |
| `title` | string | Note title |
| `type` | string | Always `note` for notes |
| `tags` | string[] | User-assigned tags |
| `folder` | string | Folder path, e.g. `Work/Projects` |
| `isPinned` | boolean | Pinned to top |
| `color` | string | Note color label: `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `gray` |
| `createdAt` | ISO string | Creation timestamp |
| `updatedAt` | ISO string | Last-modified timestamp |
| `[key]` | unknown | Any additional frontmatter fields are preserved as-is |

The frontmatter parser (`src/utils/frontmatterParser.ts`) handles:
- Scalar types: strings, booleans, numbers, dates (ISO format auto-parsed to `Date`)
- Arrays: `[item1, item2, item3]`
- Quoted strings: `"value"` or `'value'`
- Unquoted strings

## Document Types

The same file format is used for multiple content types:

| Type | Subdirectory | Default extension |
|------|-------------|-------------------|
| `note` | `documents/note/` | `.md` |
| `todo` | `documents/todo/` | `.md` |
| `template` | `documents/template/` | `.md` |
| `journal` | `documents/journal/` | `.md` |
| `canvas` | `documents/canvas/` | `.canvas` (JSON) |
| `thought-dump` | `documents/thought-dump/` | `.md` |
| `ai` | `documents/ai/` | `.md` |

## File Path

Files are stored under the Expo File System documents directory:

```
<documentDirectory>/GitNotes/<owner>/<repo>/<folder>/<slug>.<ext>
```

Example: `DocumentService` writes to `documents/note/my-first-note.md` relative to the repo root.

## DocumentIndex (SQLite)

Reading every file from disk for listing/search would be slow. `DocumentIndex` maintains a **SQLite mirror** of frontmatter metadata:

- `documents` table: `id, type, path, title, slug, folder, tags, createdAt, updatedAt, isPinned, deleted`
- `folders` table: `path, type, repo`
- `tags` table: `name, repo`

**Rule:** No document body is ever stored in SQLite. Only metadata. The file is always the source of truth.

`DocumentIndex` is used for:
- Fast note listing (without reading file bodies)
- Folder tree building
- Tag autocomplete
- Search (title, tags — not full-text)

## Note Formats

Supported file formats (stored in `format` field in `Note` model, but the file extension drives parsing):

| Format | Extension | Parser |
|--------|----------|--------|
| Markdown | `.md` | `NeorgParser` or raw text |
| Neorg | `.norg` | `NeorgParser` |
| Org mode | `.org` | `OrgContentParser` |
| JSON | `.json` | raw JSON parse |

## Wiki-Links

Notes support `[[wiki-links]]` for cross-referencing notes:

```
Check out [[My Other Note]] for more details.
```

The `wikiLinksParser.ts` extracts all wiki-links from a note's body. The `BacklinksService` builds a reverse index (which notes link TO a given note) by scanning all notes.

Backlink matching considers:
- Exact title match
- File path match (with/without extension)
- Case-insensitive normalization

## Note Save Flow

```
NoteEditorScreen.save()
  → DocumentService.createNote() / DocumentService.updateNote()
    → Write file to disk: frontmatter + body
      → DocumentIndex.upsert() — update SQLite metadata
        → BacklinksService.reindex() — update backlinks
```

See [Architecture](./architecture.md) for the full sync flow.

## See Also

- [Services](./services.md) — DocumentService, BacklinksService
- [Models](./models.md) — Note model
- [Architecture](./architecture.md) — Full data flow
- [Sync Architecture](./sync-architecture.md) — How saves become commits
