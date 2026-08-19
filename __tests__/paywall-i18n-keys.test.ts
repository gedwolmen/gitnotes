import fs from 'fs';
import path from 'path';
import en from '../src/i18n/en.json';

type Bundle = Record<string, unknown>;

function flattenKeys(bundle: Bundle, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(bundle)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const child of flattenKeys(value as Bundle, full)) keys.add(child);
    } else {
      keys.add(full);
    }
  }
  return keys;
}

const enKeys = flattenKeys(en as Bundle);

const SOURCE_FILES = [
  'src/screens/PaywallScreen.tsx',
  'src/components/paywall/ProRequired.tsx',
  'src/hooks/useProGate.ts',
  'src/screens/SettingsScreen.tsx',
  'src/components/settings/SettingsContent.tsx',
  'src/stores/aiHubStore.ts',
];

const KEY_PATTERN = /\b(?:t|i18n\.t)\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;

describe('paywall i18n key usage', () => {
  it('every static translation key referenced by paywall code exists in en.json', () => {
    const root = path.join(__dirname, '..');
    const missing = new Set<string>();
    for (const rel of SOURCE_FILES) {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) continue;
      const source = fs.readFileSync(abs, 'utf8');
      for (const match of source.matchAll(KEY_PATTERN)) {
        const key = match[1];
        if (!enKeys.has(key)) missing.add(`${rel}: ${key}`);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
