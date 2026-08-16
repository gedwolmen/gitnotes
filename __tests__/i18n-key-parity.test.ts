/**
 * i18n key-parity regression guard.
 *
 * Asserts every leaf key in `en.json` exists in es/fr/de/ja/ko — EXCEPT for a
 * documented snapshot of pre-existing missing keys (the 205-key gap found by
 * the i18n audit: settings 80, notes 27, chat 26, canvases 18, common 17,
 * home 14, errors 8, todos 7, explore 6, accounts 1, ai 1).
 *
 * Guarantees:
 *  - any key NEWLY added to en.json must be present in all 5 locales
 *    (otherwise it shows up as a missing key outside the snapshot and fails);
 *  - the known gap cannot grow silently;
 *  - todo 4 fills the 205 keys and should then shrink/remove ALLOWED_MISSING.
 *
 * This supersedes `scripts/i18n-parity.js` as the executable parity gate.
 */
import en from '../src/i18n/en.json';
import es from '../src/i18n/es.json';
import fr from '../src/i18n/fr.json';
import de from '../src/i18n/de.json';
import ja from '../src/i18n/ja.json';
import ko from '../src/i18n/ko.json';

type Bundle = Record<string, unknown>;

/** Pre-existing en-only keys (identical across all 5 locales). */
const ALLOWED_MISSING: readonly string[] = []

const ALLOWED_MISSING_SET = new Set(ALLOWED_MISSING);

const LOCALES: Array<{ name: string; bundle: Bundle }> = [
  { name: 'es', bundle: es },
  { name: 'fr', bundle: fr },
  { name: 'de', bundle: de },
  { name: 'ja', bundle: ja },
  { name: 'ko', bundle: ko },
];

function flattenKeys(bundle: Bundle, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(bundle)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Bundle, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

describe('i18n key parity', () => {
  const enKeys = new Set(flattenKeys(en as Bundle));

  it.each(LOCALES)('$name has every en.json leaf key (except the documented pre-existing gap)', ({ _name, bundle }) => {
    const localeKeys = new Set(flattenKeys(bundle));
    const missing = [...enKeys].filter((key) => !localeKeys.has(key)).sort();
    const unexpected = missing.filter((key) => !ALLOWED_MISSING_SET.has(key));

    expect(unexpected).toEqual([]);

    // Sanity check the snapshot is not stale: every allowed-missing key must
    // genuinely be missing. As todo 4 backfills translations, remove the
    // filled keys from ALLOWED_MISSING rather than leaving them here.
    const snapshotKeysStillPresent = [...ALLOWED_MISSING_SET].filter((key) => localeKeys.has(key));
    expect(snapshotKeysStillPresent).toEqual([]);
  });
});
