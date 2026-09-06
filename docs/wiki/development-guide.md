# Development Guide

> Dev commands, troubleshooting, and contributing.

## Common Commands

### Development
| Command | Description |
|---------|-------------|
| `yarn start` | Metro bundler |
| `yarn ios` | iOS |
| `yarn android` | Android |
| `yarn web` | Web (Expo) |

### Testing
| Command | Description |
|---------|-------------|
| `yarn jest` | Run tests |
| `yarn jest --watch` | Watch mode |
| `yarn ts:check` | Type check |

### Linting
| Command | Description |
|---------|-------------|
| `yarn eslint . --ext .ts,.tsx` | ESLint |
| `yarn eslint . --ext .ts,.tsx --fix` | Auto-fix |
| `yarn format` | Prettier write |
| `yarn format:check` | Prettier check |

### Build
| Command | Description |
|---------|-------------|
| `eas build -p ios` | iOS production build |
| `eas build -p android` | Android production build |

## Project Structure

```
gitnotes/
├── src/
│   ├── components/  # UI components
│   ├── contexts/    # React contexts
│   ├── hooks/       # Custom hooks
│   ├── services/    # Business logic (git/, ai/, canvas/, conflict/)
│   ├── stores/      # Zustand stores
│   ├── screens/     # Screen components
│   └── theme/       # NativeWind theme tokens
├── __tests__/       # Jest tests
├── docs/wiki/       # This wiki
└── package.json
```

## Troubleshooting

**Metro issues:** `yarn start --clear`
**iOS issues:** `cd ios && pod install`
**Type errors:** `yarn ts:check`

## Contributing

1. Fork the repo
2. Create a feature branch
3. Run `yarn lint`, `yarn ts:check`, `yarn jest`
4. Open a PR

## See Also

- [Setup](./setup.md)
- [Architecture](./architecture.md)
- [Home](./index.md)
