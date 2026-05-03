module.exports = {
  preset: 'react-native',
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': 'babel-jest',
    '^.+\\.tsx$': 'babel-jest',
  },
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/?(*.)+(spec|test).{ts,tsx}',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^expo-blur$': '<rootDir>/__mocks__/expo-blur.ts',
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/expo-file-system-legacy.ts',
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|expo|@expo|react-native-reanimated|@shopify)/)',
  ],
  collectCoverage: true,
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/',
  ],
};
