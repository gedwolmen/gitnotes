# GitNotēs Wiki

> Project knowledge base for contributors and AI agents.

## Pages

| Page | Description |
|------|-------------|
| [Architecture](./architecture.md) | Project structure, key modules, data flow |
| [Services](./services.md) | Service layer design and responsibilities |
| [Development Guide](./development-guide.md) | Local setup, build, test, lint workflow |
| [Testing Guide](./testing-guide.md) | Test patterns, mocking, CI configuration |
| [Sync Engine](./sync-engine.md) | Git sync architecture, push model, error handling |
| [Sync Engine Modes](./sync-engine-modes.md) | Per-repo clone vs API mode selection, defaults, switching |
| [AI Integration](./ai-integration.md) | Vercel AI SDK, providers, token budgeting |
| [i18n](./i18n.md) | Localization setup, adding languages, testing |
| [Theme & Styling](./theme-styling.md) | NativeWind v5, theme tokens, dark mode |
| [AI Providers](./ai-providers.md) | Provider types, Anthropic defaults, adding providers |
| [Filter Persistence](./filter-persistence.md) | Filter state architecture and AsyncStorage |
| [Importers](./importers.md) | Removed Google Keep and Apple Notes importers, for later re-integration |
| [Git Core Hardening](./git-core-hardening.md) | git-core test-campaign fixes: binary decode integrity, case collisions, auth/preflight, API batch writes, pull/reconcile fixes (#876–#892) |
| [Stage → Push UX](./stage-push-ux.md) | no row locks, vanish-immediate deletes, spinner-free grayed push buttons, determinate progress ring, body-text notifications, resume-on-foreground |
| [Token Removal Repo Cascade](./repo-removal-cascade.md) | removing a token also removes its synced repos, with a confirmation warning |
| [Token Scope Error Messaging](./token-scope-error-messaging.md) | 403s surface needed token scopes in the sync message and token-add UI |
| [Pro Paywall & Monetization](./paywall-pro.md) | RevenueCat Pro paywall: 30-day trial / $2.99 mo / $40 lifetime, grandfathering, show-locked feature UX, gating map, store setup checklist; Pro page bento grid UI redesigned (#921) |
| [Branding Asset Pipeline](./branding-pipeline.md) | one-master-SVG → generated icons/splash/favicon via sharp (`npm run branding`, #930) |
| [Daily Quote Settings](./daily-quote-settings.md) | Dataset audit/expansion to 454 verified quotes with sources + two new settings: AI personalization toggle and source visibility toggle (#933, #934) |
| [Quote Content Policy & Regression Gate](./quote-content-policy.md) | AGENTS.md Quote Content Policy enforced by `__tests__/data/philosopherQuotes.policy.test.ts`: schema/source/uniqueness/count/keyword-scan/tag-vocabulary checks with a documented secular allowlist (#933) |
| [Settings — Add Repo Fixes](./settings-add-repo-fixes.md) | Invisible primary-button fix + repo list not loading after adding a token + busy-state re-entry guard on Add-Repo picker (#936) |
| [iPad Multi-Column Card Collapse Fix](./ipad-multicolumn-card-collapse-fix.md) | SwipeableListItem root `width: '100%'` so multi-column FlatList cards fill their column (#940, #941) |

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
