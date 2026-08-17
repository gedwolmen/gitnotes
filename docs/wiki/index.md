# GitNotēs Wiki

> Project knowledge base for contributors and AI agents.

## Pages

| Page | Description |
|------|-------------|
| [Architecture](./architecture.md) | Project structure, key modules, data flow |
| [Services](./services.md) | Service layer design and responsibilities |
| [Development Guide](./development-guide.md) | Local setup, build, test, lint workflow |
| [Testing Guide](./testing-guide.md) | Test patterns, mocking, CI configuration |
| [Sync Engine](./sync-engine.md) | Git sync architecture, error handling |
| [AI Integration](./ai-integration.md) | Vercel AI SDK, providers, token budgeting |
| [i18n](./i18n.md) | Localization setup, adding languages, testing |
| [Theme & Styling](./theme-styling.md) | NativeWind v5, theme tokens, dark mode |
| [AI Providers](./ai-providers.md) | Provider types, Anthropic defaults, adding providers |
| [Filter Persistence](./filter-persistence.md) | Filter state architecture and AsyncStorage |
| [Importers](./importers.md) | Removed Google Keep and Apple Notes importers, for later re-integration |
| [Git Core Hardening](./git-core-hardening.md) | git-core test-campaign fixes: binary decode integrity, case collisions, auth/preflight, API batch writes, pull/reconcile fixes (#876–#892) |

## Quick Start

```bash
# Install
yarn install

# Run
yarn ios          # iOS
yarn android      # Android
yarn dev          # Web

# Test
yarn ts:check     # Type check
yarn jest         # Run tests
yarn eslint . --ext .ts,.tsx  # Lint
```

## Project Structure

```
src/
├── components/       # Reusable UI components
├── contexts/         # React contexts (ThemeContext, NoteContext)
├── hooks/            # Custom React hooks
├── i18n/             # Localization (en/es/fr/de/ja/ko)
├── models/           # TypeScript interfaces
├── navigation/       # Navigation configuration
├── screens/          # Screen components
├── services/         # Business logic (AI, Git, quotes, etc.)
├── stores/           # Zustand stores
├── theme/            # NativeWind theme configuration
└── types/            # Shared type definitions
```

## Key Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Rules for AI coding agents |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |
| `jest.config.js` | Jest configuration |
| `babel.config.cjs` | Babel configuration |
