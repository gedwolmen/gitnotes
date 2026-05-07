import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifestPath = path.resolve(__dirname, '../coverage-manifest.json');
const srcDir = path.resolve(__dirname, '../../src');

interface ManifestEntry {
  file: string;
  component: string;
  elementType: string;
  action: string;
  testID: string;
  flowId: string;
  platform: string[];
}

const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

const files = walkDir(srcDir, ['.tsx', '.ts']);
const allTestIDs = new Set<string>();

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  // Match JSX: testID="..." or testID={`...`} or testID={testID}
  const jsxRegex = /testID\s*=\s*\{?\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = jsxRegex.exec(content)) !== null) {
    allTestIDs.add(match[1]);
  }
  // Match object property: testID: '...' or testID: "..."
  const objRegex = /testID\s*:\s*['"`]([^'"`]+)['"`]/g;
  while ((match = objRegex.exec(content)) !== null) {
    allTestIDs.add(match[1]);
  }
}

let covered = 0;
let uncovered = 0;
let skipped = 0;
const uncoveredEntries: ManifestEntry[] = [];

for (const entry of manifest) {
  if ((entry as any).na) {
    skipped++;
    continue;
  }
  const baseID = entry.testID.replace(/\$\{[^}]+\}/g, '');
  let found = false;
  for (const id of allTestIDs) {
    const resolved = id.replace(/\$\{[^}]+\}/g, '');
    if (resolved === baseID || id.startsWith(baseID)) {
      found = true;
      break;
    }
  }
  if (found) {
    covered++;
  } else {
    uncovered++;
    uncoveredEntries.push(entry);
  }
}

console.log('Coverage Matrix Report');
console.log('=====================');
console.log(`Total manifest entries: ${manifest.length} (${skipped} N/A)`);
console.log(`Covered by testIDs: ${covered}`);
console.log(`Uncovered: ${uncovered}`);
console.log(`Coverage: ${((covered / (manifest.length - skipped)) * 100).toFixed(1)}%`);

if (uncovered > 0) {
  console.log('\nUncovered entries:');
  const byFlow: Record<string, ManifestEntry[]> = {};
  for (const entry of uncoveredEntries) {
    if (!byFlow[entry.flowId]) byFlow[entry.flowId] = [];
    byFlow[entry.flowId].push(entry);
  }
  for (const [flow, entries] of Object.entries(byFlow)) {
    console.log(`\n  ${flow} (${entries.length}):`);
    for (const e of entries.slice(0, 5)) {
      console.log(`    ${e.file} → ${e.testID}`);
    }
    if (entries.length > 5) {
      console.log(`    ... and ${entries.length - 5} more`);
    }
  }
}

if (uncovered > 0) {
  console.log(`\nVERDICT: INCOMPLETE (${uncovered} unmapped)`);
  process.exit(1);
} else {
  console.log('\nVERDICT: COMPLETE (100% mapped)');
  process.exit(0);
}

function walkDir(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        results.push(...walkDir(fullPath, ext));
      }
    } else if (ext.some((e) => entry.name.endsWith(e))) {
      results.push(fullPath);
    }
  }
  return results;
}
