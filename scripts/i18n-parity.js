const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n');
const LOCALE_NAMES = ['en', 'es', 'fr', 'de', 'ja', 'ko'];

function loadLocale(name) {
  const filePath = path.join(LOCALES_DIR, `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

function resolvePath(obj, dotPath) {
  const parts = dotPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function checkNamespace(namespace) {
  const resolved = {};
  for (const name of LOCALE_NAMES) {
    resolved[name] = resolvePath(loadLocale(name), namespace);
  }

  const sample = Object.values(resolved).find((v) => v !== undefined);
  if (sample === undefined) {
    return { keyCount: 0, errors: [`  ALL locales: MISSING "${namespace}"`] };
  }

  if (typeof sample !== 'object' || Array.isArray(sample)) {
    const errors = [];
    for (const name of LOCALE_NAMES) {
      if (resolved[name] === undefined) {
        errors.push(`  ${name}: MISSING key "${namespace}"`);
      }
    }
    return { keyCount: 1, errors };
  }

  const localeKeys = {};
  const allKeys = new Set();
  for (const name of LOCALE_NAMES) {
    if (resolved[name] && typeof resolved[name] === 'object') {
      const keys = new Set(flattenKeys(resolved[name]));
      localeKeys[name] = keys;
      for (const k of keys) allKeys.add(k);
    } else {
      localeKeys[name] = null;
    }
  }

  const errors = [];
  for (const name of LOCALE_NAMES) {
    if (localeKeys[name] === null) {
      errors.push(`  ${name}: MISSING namespace "${namespace}"`);
      continue;
    }
    for (const k of allKeys) {
      if (!localeKeys[name].has(k)) {
        errors.push(`  ${name}: missing key "${namespace}.${k}"`);
      }
    }
  }

  return { keyCount: allKeys.size, errors };
}

const namespaces = process.argv.slice(2);
if (namespaces.length === 0) {
  console.error('Usage: node scripts/i18n-parity.js <namespace1> [namespace2] ...');
  console.error('Example: node scripts/i18n-parity.js thoughtDump settings.resetAIMemory');
  process.exit(1);
}

let hasErrors = false;
for (const ns of namespaces) {
  const { keyCount, errors } = checkNamespace(ns);
  if (errors.length > 0) {
    console.log(`FAIL: ${ns} (${keyCount} keys)`);
    errors.forEach((e) => console.log(e));
    hasErrors = true;
  } else {
    const kind = keyCount === 1 ? 'leaf key' : `${keyCount} keys`;
    console.log(`PASS: ${ns} (${kind}, all ${LOCALE_NAMES.length} locales)`);
  }
}

if (hasErrors) {
  process.exit(1);
}
console.log('\nAll namespaces have key parity across all locales.');
