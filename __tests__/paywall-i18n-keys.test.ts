import fs from 'fs';
import path from 'path';
import en from '../src/i18n/en.json';
import es from '../src/i18n/es.json';
import fr from '../src/i18n/fr.json';
import de from '../src/i18n/de.json';
import ja from '../src/i18n/ja.json';
import ko from '../src/i18n/ko.json';

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
  'src/components/paywall/PaywallFeatureGrid.tsx',
  'src/utils/proAlerts.ts',
  'src/hooks/useProGate.ts',
  'src/hooks/useProScreenGuard.ts',
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

// Keys added with the bento paywall: per-feature descriptions, restore states,
// yearly trial CTA, and legal footer links.
const NEW_PAYWALL_KEYS: readonly string[] = [
  'paywall.features.aiChat.description',
  'paywall.features.aiActions.description',
  'paywall.features.thoughtDump.description',
  'paywall.features.voiceDump.description',
  'paywall.features.personalizedQuotes.description',
  'paywall.features.githubTools.description',
  'paywall.features.canvases.description',
  'paywall.features.templates.description',
  'paywall.features.renderStyles.description',
  'paywall.features.multiAccount.description',
  'paywall.restoring',
  'paywall.nothingToRestore',
  'paywall.yearly.trialCta',
  'paywall.footer.terms',
  'paywall.footer.privacy',
];

const LOCALES: Array<{ name: string; bundle: Bundle }> = [
  { name: 'en', bundle: en },
  { name: 'es', bundle: es },
  { name: 'fr', bundle: fr },
  { name: 'de', bundle: de },
  { name: 'ja', bundle: ja },
  { name: 'ko', bundle: ko },
];

describe('new paywall keys in every locale', () => {
  it.each(LOCALES)('$name has every bento/restore/yearly/legal key', ({ bundle }) => {
    const localeKeys = flattenKeys(bundle);
    const missing = NEW_PAYWALL_KEYS.filter((key) => !localeKeys.has(key)).sort();
    expect([...missing]).toEqual([]);
  });
});
