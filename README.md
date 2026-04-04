# GitNotes

A React Native app built with Expo for managing development notes with Git integration.

## Getting Started

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
│   ├── models/                # TypeScript models
│   ├── services/             # API and storage services
│   └── utils/                # Utility functions
└── assets/                   # Images and fonts
```

## Features

- 📝 Create and organize development notes
- 🔄 Link notes to Git repositories and commits
- 🏷️ Tag notes for easy organization
- 🔍 Search and filter functionality
- 🌙 Dark mode support

## Development

Built with:
- Expo SDK 55
- React Native 0.84
- TypeScript
- React Navigation v7

## License

MIT