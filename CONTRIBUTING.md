# Contributing to GitNotēs

Thank you for your interest in contributing to GitNotēs!

## Development Setup

### Prerequisites

- Node.js >= 20.18
- Yarn 1.22.x
- Xcode (for iOS development)
- Android Studio (for Android development)

### Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/gitnotes.git`
3. Install dependencies: `yarn install`
4. Start the development server: `yarn start`

### Running the App

```bash
# iOS
yarn ios

# Android
yarn android

# Web
yarn web
```

## Development Workflow

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check formatting
yarn lint
yarn format:check

# Fix formatting issues
yarn lint:fix
yarn format
```

### Type Checking

```bash
yarn ts:check
```

### Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test --watch

# Run tests with coverage
yarn test --coverage
```

### Running E2E Tests

We use Maestro for end-to-end testing.

```bash
# iOS E2E tests
yarn e2e:ios:smoke
yarn e2e:ios:full

# Android E2E tests
yarn e2e:android:smoke
yarn e2e:android:full
```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, semicolons, etc)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks (dependencies, build scripts, etc)

Example: `feat: add dark mode support for canvas editor`

## Pull Request Process

1. Ensure all tests pass: `yarn ts:check && yarn test`
2. Update documentation if you've changed functionality
3. Your PR will be reviewed by maintainers
4. Once approved, your changes will be merged

## Project Structure

```
src/
├── components/     # Reusable UI components
├── contexts/       # React contexts
├── hooks/          # Custom React hooks
├── i18n/           # Internationalization
├── models/         # Data models
├── navigation/     # Navigation configuration
├── screens/        # App screens
├── services/       # Business logic services
├── stores/         # Zustand stores
├── theme/          # Theme configuration
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

## Questions?

Feel free to:

- [Open an issue](https://github.com/gedwolmen/gitnotes/issues/new) for bugs or feature requests
- Join the discussion on existing issues

## License

By contributing, you agree that your contributions will be licensed under the [Mozilla Public License 2.0](https://www.mozilla.org/en-US/MPL/2.0/).
