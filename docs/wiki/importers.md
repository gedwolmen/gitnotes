# Importers (Removed)

> Documentation of the Google Keep and Apple Notes importers that were removed in commit `10348ca` (2026-08-16). This page preserves their behavior so they can be re-integrated later. The code is still reachable in git history; nothing in this page should be recreated from scratch.

## Google Keep importer

`parseGoogleKeepTakeout(files: ImportedFile[]): ImportedNote[]`

Former path: `src/services/import/GoogleKeepImporter.ts` (116 lines).

### Input

A Google Takeout ZIP selected through the document picker (`application/zip`). The ZIP is unzipped with `jszip`, and the resulting files are passed in as `ImportedFile` entries. Each Keep note ships as a pair of files with the same base name:

- `note.html` — the rendered note
- `note.json` — metadata (labels, color, pin state, timestamps)

The importer iterates the `.html` files and looks up the matching `.json` by base name. A note with malformed or missing JSON still imports, using only the HTML content.

### Parsing behavior

- **Title**: taken from `<title>` inside `<head>`, falling back to `<h1>`. If the JSON has a `title` and the HTML produced none, the JSON title wins. Final fallback is `'Untitled'`.
- **Body**: the `<body>` content is extracted and converted to Markdown with `htmlToMarkdown`.
- **Tags**: `labels[].name` from the JSON, empty labels filtered out.
- **Color mapping** (from JSON `color`, uppercased before lookup):

  | Keep color | Note color |
  |------------|------------|
  | `RED`      | `red`      |
  | `ORANGE`   | `orange`   |
  | `YELLOW`   | `yellow`   |
  | `GREEN`    | `green`    |
  | `TEAL`     | `blue`     |
  | `BLUE`     | `blue`     |
  | `PURPLE`   | `purple`   |
  | `PINK`     | `pink`     |
  | `WHITE`, `DEFAULT` | none (cleared) |

- **Pinned**: `isPinned` from the JSON.
- **Timestamps**: `createdTimestampUsec` (microseconds since epoch, divided by 1000) becomes `createdAt`; `userEditedTimestampUsec` becomes `updatedAt`. When a timestamp is missing or unparseable, `createdAt` falls back to `new Date()` and `updatedAt` to `createdAt`.

## Apple Notes importer

`parseAppleNotesExport(files: ImportedFile[]): ImportedNote[]`

Former path: `src/services/import/AppleNotesImporter.ts` (65 lines).

### Input

Files from an Apple Notes export. Only `.txt`, `.html`, and `.htm` files are processed; everything else is skipped.

### Parsing behavior

- **HTML files**: title comes from `<title>` or `<h1>`; the full file is converted to Markdown with `htmlToMarkdown`.
- **Text files**: the first line is the title, and the remaining lines joined with `\n` form the content.
- **Folder**: the relative path is split on `/`; every segment except the last becomes the folder. The folder is used both as the note's `folder` field and as a single-element tag.
- **Title fallback**: when the extracted title is empty, the file name is used with the extension stripped (`sanitizeFilename`), falling back to `'Untitled'`.
- **Timestamps**: both `createdAt` and `updatedAt` are set to the import time (`new Date()`). `pinned` is always `false`.

## Removal notes

- **Commit**: `10348ca` — `feat(explore): browse any branch in file tree; remove Google Keep and Apple Notes importers`, dated 2026-08-16. Full hash `10348ca8f05430729f936c4da7604eb5d5a926e1`. The importer code was originally added in `6a84de0` (`feat(import): add Google Keep and Apple Notes importers (#531)`).
- **Files deleted**:
  - `src/services/import/GoogleKeepImporter.ts`
  - `src/services/import/AppleNotesImporter.ts`
  - `src/services/import/types.ts` (`ImportedFile`, `ImportedNote`)
  - `src/components/settings/ImportSection.tsx`
  - `src/utils/htmlToMarkdown.ts` (only the importers used it)
  - `__tests__/services/import/GoogleKeepImporter.test.ts`
  - `__tests__/services/import/AppleNotesImporter.test.ts`
- **UI entry point**: `ImportSection` was rendered in `src/components/settings/SettingsContent.tsx` (import at line 18, render at line 763). It offered two actions: "Import from Google Keep" (pick a Takeout ZIP) and "Import from Apple Notes" (pick export files). Imported notes were created through `useNotes().createNote` with `format: 'markdown'`; note colors were validated with `isNoteColor` before being passed through.
- **i18n keys**: the `"import"` block existed in all six locale files (`en.json` lines 573-590, mirrored in `es/fr/de/ja/ko`). Keys: `import.keep.*` (`noNotesTitle`, `noNotesBody`, `completeTitle`, `completeBody`, `failedTitle`), `import.apple.*` (same shape), plus `import.partialFinishedTitle` and `import.partialFinishedBody`.
- **Tests removed**: `__tests__/services/import/GoogleKeepImporter.test.ts` (135 lines) and `__tests__/services/import/AppleNotesImporter.test.ts` (151 lines). The `jest.mock('../src/components/settings/ImportSection', ...)` block in `__tests__/settings-reset-ai-memory.test.tsx` was also removed.
- **README**: the "Importers for Google Keep and Apple Notes" bullet was replaced with a pointer to this page.

## How to re-integrate

1. **Restore the code from git history.** The parent of the removal commit holds every deleted file:

   ```bash
   git checkout 10348ca^ -- src/services/import/ src/components/settings/ImportSection.tsx src/utils/htmlToMarkdown.ts
   ```

   To bring the tests back too, add the test paths to the same command:

   ```bash
   git checkout 10348ca^ -- __tests__/services/import/
   ```

2. **Re-wire the UI.** Import `ImportSection` in `src/components/settings/SettingsContent.tsx` and render `<ImportSection />` in the settings list (previously near line 763, inside the Notes/tools group).
3. **Re-add the i18n blocks.** Restore the `"import"` block from `10348ca^`'s `src/i18n/en.json` (and the mirrored blocks in `es/fr/de/ja/ko`) so the keys pass the i18n parity test.
4. **Re-add the tests.** Restore `__tests__/services/import/` and the `jest.mock` for `ImportSection` in `__tests__/settings-reset-ai-memory.test.tsx` if that file needs it.
5. **Verify** with `yarn ts:check`, `yarn jest`, and `yarn eslint . --ext .ts,.tsx`. `src/utils/htmlToMarkdown.ts` must be restored in the same change, since both importers depend on it.
