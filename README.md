<p align="center">
<img width="200" height="200" alt="icon" align="center" src="https://github.com/user-attachments/assets/776e9654-0117-44c5-a85e-5a72e7f4ac9f" />
</p>

# GitNotēs

A React Native app built with Expo for managing development notes with Git integration.

## Features

### Notes & content
- ✅ Create, organize, and tag development notes
- ✅ Link notes to Git repositories and commits
- ✅ Markdown rendering with code-fence handling
- ✅ Filter notes by folder
- ✅ Repo browser with flat "All notes" view
- ✅ Search and filter across notes

### Editor & canvas
- ✅ Markdown editor with preview mode
- ✅ Canvas editor with pinch-zoom and two-finger pan
- ✅ Neorg-style table rendering

### GitHub integration
- ✅ Lists private + collaborator repos with pagination
- ✅ Conflict-aware uploads (retry on 409, skip on existing 422)

### UI / UX
- ✅ Neumorphic design system (tokens, `Surface`, elevation builder)
- ✅ Unified `NScreenHeader` + `SearchBar` across tab screens
- ✅ Floating `NTabBar` pill
- ✅ Dark mode support
- ✅ Haptic feedback
- ✅ Cross-platform primitives (iOS + Android)

### Reliability
- ✅ Comprehensive error handling
- ✅ Loading states for async ops

## Getting Started

### Prerequisites

- Node.js 22.x or higher
- npm or yarn
- Expo CLI
- iOS Simulator (for iOS development) or Android Emulator (for Android development)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npx expo start
   ```

3. Run on your device:
   - Scan the QR code with your phone (Expo Go app required)
   - Press `a` for Android emulator
   - Press `i` for iOS simulator

## Project Structure

```
gitnotes/
├── App.tsx                    # Entry point
├── src/
│   ├── navigation/            # Navigation configuration
│   ├── screens/               # Screen components
│   ├── contexts/              # React contexts
│   ├── components/            # Reusable components
│   │   └── ui/                # Neumorphic primitives (Surface, NTabBar, etc.)
│   ├── theme/                 # Design tokens, elevation, useTokens hook
│   ├── models/                # TypeScript models
│   ├── services/              # API and storage services
│   └── utils/                 # Utility functions
└── assets/                    # Images and fonts
```

## Design System

GitNotēs ships a neumorphic design system:

- **Tokens** — `src/theme/` exposes color/elevation/spacing tokens via `useTokens`.
- **Primitives** — `Surface` (cross-platform soft shadows), `NScreenHeader`, `SearchBar`, `NTabBar`, `NGroup`.
- **Gallery** — dev-only `NeumorphicGallery` for visual smoke testing.
- **Style flag** — toggle between flat and neumorphic via theme flag.

## Development

Built with:
- Expo SDK 55
- React Native 0.83.4
- TypeScript 5.9.3
- React Navigation v7

## Security

This project addresses the following security vulnerabilities:
- ✅ **markdown-it (GHSA-6vfc-qv3f-vr6c)**: Fixed by forcing markdown-it v14.1.1 using npm overrides

Open advisories tracked in issues (see #222 for upstream Expo bumps for postcss + uuid CVEs).

## Deployment

### Prerequisites for Production Deployment

1. Apple Developer Account (for iOS/TestFlight)
2. Google Play Console Account (for Android/Play Store)

### Build for Production

1. **Configure EAS credentials** (first time only):
   ```bash
   eas login
   eas build:configure
   ```

2. **Build for iOS**:
   ```bash
   eas build --platform ios --profile production
   ```

3. **Build for Android**:
   ```bash
   eas build --platform android --profile production
   ```

4. **Submit to TestFlight** (requires Apple Developer account):
   ```bash
   eas submit --platform ios --profile production
   ```

5. **Submit to Play Store** (requires Google Play Console account):
   ```bash
   eas submit --platform android --profile production
   ```

### EAS Configuration

The project includes an `eas.json` configuration file with three build profiles:

- **development**: For testing during development
- **preview**: For internal distribution
- **production**: For App Store and Play Store submission

## Testing

Run TypeScript type checking:
```bash
npm run ts:check
```

## Contributing

This project uses atomic commits following the Sisyphus workflow. Each commit represents a single, focused change.

## License

MIT
