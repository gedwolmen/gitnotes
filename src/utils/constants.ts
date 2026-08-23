// Theme color definitions
export const lightTheme = {
  dark: false,
  colors: {
    primary: '#007AFF',
    background: '#F5F5F5',
    surface: '#FFFFFF',
    text: '#333333',
    textSecondary: '#666666',
    textTertiary: '#999999',
    border: '#E0E0E0',
    borderLight: '#F0F0F0',
    error: '#FF3B30',
    success: '#34C759',
    card: '#FFFFFF',
    shadow: 'rgba(0, 0, 0, 0.1)',
  },
};

export const darkTheme = {
  dark: true,
  colors: {
    primary: '#0A84FF',
    background: '#000000',
    surface: '#1C1C1E',
    text: '#FFFFFF',
    textSecondary: '#EBEBF5',
    textTertiary: '#8E8E93',
    border: '#38383A',
    borderLight: '#2C2C2E',
    error: '#FF453A',
    success: '#32D74B',
    card: '#1C1C1E',
    shadow: 'rgba(0, 0, 0, 0.3)',
  },
};

// AsyncStorage keys
export const STORAGE_KEYS = {
  THEME_PREFERENCE: '@gitnotes_theme_preference',
  NOTES: '@gitnotes_notes',
} as const;

// Note model
export const NOTE_COLORS = {
  default: '#007AFF',
  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFCC00',
  green: '#34C759',
  blue: '#007AFF',
  purple: '#AF52DE',
  pink: '#FF2D55',
} as const;

export const LEGAL_URLS = {
  terms: 'https://www.gitnotes.org/terms',
  privacy: 'https://www.gitnotes.org/privacy',
} as const;