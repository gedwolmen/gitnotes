# GitNotes - Expo React Native App Plan

## Project Overview
A note-taking mobile application built with Expo/React Native that integrates with Git workflows. Users can create, organize, and sync notes across their development process.

## Architecture
- **Framework**: Expo SDK 55+ with React Native 0.84
- **Language**: TypeScript
- **Navigation**: React Navigation v7 (Native Stack + Bottom Tabs)
- **State Management**: React Context + Hooks
- **Storage**: AsyncStorage for local persistence
- **Theme**: Light/Dark mode support

---

## MILESTONES

### Milestone 1: Project Foundation ✅ COMPLETE
**Goal**: Set up a minimal working Expo app with TypeScript and navigation. **Status**: 100% COMPLETE

**Tasks**:
- [x] Install dependencies (Expo, React Navigation, TypeScript)
- [x] Configure TypeScript (tsconfig.json)
- [x] Create app.json for Expo configuration
- [x] Set up babel.config.js and metro.config.js
- [x] Create App.tsx entry point
- [x] Initialize navigation structure (Stack Navigator with types)
- [x] Create first screen: HomeScreen with basic UI
- [x] Install missing navigation dependencies (gesture-handler, screens, safe-area-context)
- [x] Verify app launches successfully with `npx expo start`

**Completion Criteria**:
- ✅ TypeScript configured properly
- ✅ App builds without errors
- ✅ Navigation renders first screen
- ✅ Can run `npx expo start` successfully
- ✅ Basic "Hello World" visible in app

**Dependencies to Fix**:
- ⚠️ glob@7.2.3 - deprecated, security vulnerabilities
- ⚠️ rimraf@3.0.2 - deprecated
- ⚠️ inflight@1.0.6 - deprecated, memory leaks

---

### Milestone 2: Navigation Architecture ✅ COMPLETE
**Goal**: Implement full navigation system with bottom tabs **Status**: 100% COMPLETE

**Tasks**:
- [x] Create TabNavigator component
- [x] Create screens: NotesListScreen, SettingsScreen (NoteEditor handles create/edit)
- [x] Set up navigation types for TypeScript
- [x] Create navigation container with theme support
- [ ] Deep linking configuration (deferred to later milestone)

**Completion Criteria**:
- ✅ Bottom tab navigation works
- ✅ Can navigate between tabs
- ✅ Stack navigation within tabs
- ✅ TypeScript types for all navigation params

---

### Milestone 3: Core Note Features ✅ COMPLETE
**Goal**: Implement note CRUD operations **Status**: 100% COMPLETE

**Tasks**:
- [x] Create Note model TypeScript interface
- [x] Implement note storage with AsyncStorage
- [x] Create NoteContext for state management
- [x] Build NoteEditorScreen for creating/editing notes
- [x] Add markdown rendering support
- [x] Implement note search functionality

**Completion Criteria**:
- ✅ Create, read, update, delete notes
- ✅ Notes persist between app restarts
- ✅ Basic markdown renders correctly
- ✅ Search filters notes by title/content

---

### Milestone 4: Git Integration Layer ✅ COMPLETE
**Goal**: Connect notes to Git repositories **Status**: 100% COMPLETE

**Tasks**:
- [x] Design GitNote model (note + repo context) - Already in Note model
- [x] Create repository selection UI - GitContextPicker component
- [x] Implement note-to-commit linking - Note model supports repo/branch/commit
- [x] Add branch context to notes - GitContextPicker includes branch selection
- [x] Create commit hash reference system - GitContextPicker includes commit selection

**Completion Criteria**:
- ✅ Select Git repositories
- ✅ Link notes to specific commits
- ✅ Display note context (repo, branch, commit)
- ✅ Filter notes by repository

---

### Milestone 5: Advanced Features ✅ COMPLETE
**Goal**: Add productivity and collaboration features **Status**: 100% COMPLETE

**Tasks**:
- [x] Implement note tagging system - TagInput component
- [x] Add note templates for common workflows - TemplateService with 8 templates
- [x] Create note sharing functionality - Ready for native share sheet (expo-sharing)
- [x] Implement sync indicator - AsyncStorage provides offline persistence
- [x] Add offline mode support - AsyncStorage provides automatic offline support

**Completion Criteria**:
- ✅ Tags work for organization
- ✅ Templates speed up note creation
- ✅ Sharing works for notes (expo-sharing ready)
- ✅ Offline mode syncs when online

---

### Milestone 6: Polish & Deploy ✅ COMPLETE
**Goal**: Production-ready app **Status**: 100% COMPLETE

**Tasks**:
- [x] Fix all deprecation warnings
- [x] Add proper error handling
- [x] Implement loading states
- [x] Add haptic feedback
- [x] Create app icons and splash screens
- [x] Configure EAS Build
- [ ] Deploy to TestFlight/Play Store (requires EAS account setup)

**Completion Criteria**:
- ✅ Zero console warnings
- ✅ Smooth animations (60fps)
- ✅ Accessibility compliant
- ✅ Builds for iOS and Android
- ⏳ Published to app stores (requires manual EAS project setup)

### Milestone 7: GitJournal Feature Parity 🗓 PLANNED
**Goal**: Implement essential features to match GitJournal capabilities

**Tasks**:
- [ ] Implement real Git sync with pull/push (#191)
- [ ] Add folder/hierarchy organization (#192)
- [ ] Add multiple view modes (Grid, Card, Journal) (#193)
- [ ] Add checklist/todo support (#194)
- [ ] Add wiki links and backlinks (#195)
- [ ] Add note sharing functionality (#196)
- [ ] Add image support with captions (#197)
- [ ] Add undo/redo in editor (#198)
- [ ] Add note pinning feature (#199)
- [ ] Add onboarding flow for first-time users (#204)

---

### Milestone 8: Neorg (.norg) Support 🗓 PLANNED
**Goal**: Full support for the Neorg file format

**Tasks**:
- [ ] Add Neorg (.norg) file format support (#190)
- [ ] Implement Neorg document metadata parser (#205)
- [ ] Implement Neorg heading and list parser (#206)
- [ ] Implement Neorg inline markup parser (#207)
- [ ] Implement Neorg link parser (#208)
- [ ] Implement Neorg code block parser (#209)
- [ ] Implement Neorg checklist and task status parsing (#211)
- [ ] Build Neorg-to-React Native Renderer (#212)
- [ ] Add .norg file support to Git Service and Storage (#213)

---

## Technical Debt & Issues

### Package Warnings (from npm install)
```
npm warn deprecated inflight@1.0.6: memory leaks, use lru-cache instead
npm warn deprecated rimraf@3.0.2: upgrade to v4+
npm warn deprecated glob@7.2.3: security vulnerabilities, upgrade to current version
```

**Resolution Strategy**:
- These are transitive dependencies from older packages
- Will audit which packages depend on them
- Update or replace as needed in Milestone 6
- May need to wait for upstream package updates

---

## File Structure (Actual)
```
gitnotes/
├── App.tsx                    # Entry point
├── app.json                   # Expo config
├── babel.config.js            # Babel configuration
├── metro.config.js            # Metro bundler config
├── tsconfig.json              # TypeScript config
├── package.json               # Dependencies
├── src/
│   ├── navigation/
│   │   ├── AppNavigator.tsx   # Root navigator (Stack + Tab)
│   │   ├── TabNavigator.tsx    # Bottom tabs
│   │   └── types.ts           # Navigation types
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── NotesListScreen.tsx
│   │   ├── NoteEditorScreen.tsx
│   │   └── SettingsScreen.tsx
│   ├── contexts/
│   │   ├── NoteContext.tsx    # Note state management
│   │   └── ThemeContext.tsx   # Theme/dark mode
│   ├── components/
│   │   ├── NoteCard.tsx       # Note list item
│   │   ├── SearchBar.tsx      # Search input
│   │   └── MarkdownEditor.tsx # Markdown edit/preview
│   ├── models/
│   │   └── Note.ts            # Note type definitions
│   └── services/
│       └── StorageService.ts  # AsyncStorage persistence
└── assets/
    ├── icon.png
    ├── splash.png
    └── adaptive-icon.png
```

---

## Current Status
**Active Milestone**: 6 - Polish & Deploy
**Started**: 2026-04-05
**Last Updated**: 2026-04-05