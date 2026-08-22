const mockSetPreferencesAsync = jest.fn().mockResolvedValue(undefined);
let mockRequireNativeModule: jest.Mock;

jest.mock('expo-modules-core', () => ({
  requireNativeModule: jest.fn((name: string) => {
    if (name === 'DevMenuPreferences') {
      return { setPreferencesAsync: mockSetPreferencesAsync };
    }
    throw new Error(`Unknown native module: ${name}`);
  }),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import { requireNativeModule } from 'expo-modules-core';
import { hideDevMenuFloatingActionButton } from '../../src/utils/devMenuFab';

describe('hideDevMenuFloatingActionButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireNativeModule = requireNativeModule as jest.Mock;
  });

  it('disables the floating action button in development on iOS', () => {
    hideDevMenuFloatingActionButton();
    expect(mockRequireNativeModule).toHaveBeenCalledWith('DevMenuPreferences');
    expect(mockSetPreferencesAsync).toHaveBeenCalledWith({ showFloatingActionButton: false });
  });
});
