import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './en.json';
import es from './es.json';
import ja from './ja.json';
import de from './de.json';
import ko from './ko.json';
import fr from './fr.json';

const LANGUAGE_KEY = 'i18n_language';

const resources = {
  en: { translation: en },
  es: { translation: es },
  ja: { translation: ja },
  de: { translation: de },
  ko: { translation: ko },
  fr: { translation: fr },
};

export const SUPPORTED_LANGUAGES = [
  { code: 'system', label: 'System Default' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ja', label: '日本語' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const SUPPORTED_BUNDLE_CODES = ['en', 'es', 'ja', 'de', 'ko', 'fr'] as const;

function getDeviceLanguage(): string {
  const locales = getLocales();
  const lang = (locales?.[0]?.languageCode ?? 'en').toLowerCase();
  for (const code of SUPPORTED_BUNDLE_CODES) {
    if (lang === code || lang.startsWith(`${code}-`)) return code;
  }
  return 'en';
}

async function getSavedLanguage(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (saved && saved !== 'system') return saved;
    return getDeviceLanguage();
  } catch {
    return getDeviceLanguage();
  }
}

export async function setLanguage(code: LanguageCode): Promise<void> {
  if (code === 'system') {
    await AsyncStorage.setItem(LANGUAGE_KEY, 'system');
    await i18n.changeLanguage(getDeviceLanguage());
  } else {
    await AsyncStorage.setItem(LANGUAGE_KEY, code);
    await i18n.changeLanguage(code);
  }
}

export async function getLanguagePreference(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(LANGUAGE_KEY)) ?? 'system';
  } catch {
    return 'system';
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  compatibilityJSON: 'v4',
  interpolation: {
    escapeValue: false,
  },
});

getSavedLanguage().then((lng) => {
  i18n.changeLanguage(lng);
});

export default i18n;
