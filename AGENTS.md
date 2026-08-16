# GitNotēs — Agent Rules

> Rules for AI coding agents working in this repository.

## Testing

All tests must pass before pushing:

```bash
yarn ts:check       # TypeScript compilation
yarn jest           # Run all Jest tests
yarn eslint . --ext .ts,.tsx  # Linting
```

- **Never push failing tests.** CI runs the same suite.
- New service/hook/feature needs a test file in `__tests__/` mirroring the `src/` structure.
- Use `@testing-library/react-native` for component tests.
- Use `jest.mock()` for service dependencies, `Date.now()` mocking for cache tests.
- Run `yarn jest __tests__/specific-file.test.ts --no-coverage --forceExit` for targeted testing.

## Self-Documenting Code

- Clear names, no comments explaining obvious behavior.
- Use TypeScript strict mode — no `any` without justification.
- Keep functions short and focused (single responsibility).
- Use the existing patterns in `src/services/` as reference.

## Git Discipline

- Atomic commits with descriptive messages (imperative mood).
- No `node_modules/`, `.DS_Store`, `.env`, or build artifacts.
- Branch per feature, rebase before merging.
- `lint-staged` runs on pre-commit (ESLint + Prettier).

## Wiki documentation

- Every fix or feature MUST be documented in the wiki (docs/wiki/). Each page must be added to the docs/wiki/index.md table. Wiki documentation is part of the definition of done.

## Data Safety

- **Never push secrets, API keys, or auth tokens.**
- `.env` is in `.gitignore` — use `.env.example` for templates.
- Check `git diff` before committing to ensure no sensitive data.
