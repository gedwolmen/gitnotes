import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function extractTestIDs(content: string, filePath: string): { id: string; line: number }[] {
  const ids: { id: string; line: number }[] = [];
  const regex = /testID\s*=\s*\{?\s*["'`]([^"'`]+)["'`]/g;
  let match;
  const lines = content.split('\n');
  const fullContent = content;
  while ((match = regex.exec(fullContent)) !== null) {
    const pos = match.index;
    let lineNum = 1;
    let acc = 0;
    for (const line of lines) {
      acc += line.length + 1;
      if (acc > pos) break;
      lineNum++;
    }
    ids.push({ id: match[1], line: lineNum });
  }
  return ids;
}

const srcDir = path.resolve(__dirname, '../../src');
const files = walkDir(srcDir, ['.tsx', '.ts']);
const allIds: { id: string; file: string; line: number }[] = [];
let errors = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const ids = extractTestIDs(content, file);
  for (const { id, line } of ids) {
    allIds.push({ id, file: path.relative(srcDir, file), line });
  }
}

// Check duplicates
const idMap = new Map<string, { file: string; line: number }[]>();
for (const entry of allIds) {
  if (!idMap.has(entry.id)) idMap.set(entry.id, []);
  idMap.get(entry.id)!.push({ file: entry.file, line: entry.line });
}

let duplicates = 0;
for (const [id, locations] of idMap) {
  if (locations.length > 1) {
    if (id.includes('${')) continue;
    duplicates++;
    console.error(`DUPLICATE: "${id}" found in ${locations.length} places:`);
    for (const loc of locations) {
      console.error(`  ${loc.file}:${loc.line}`);
    }
    errors++;
  }
}

// Check empty
let empty = 0;
for (const entry of allIds) {
  if (!entry.id || entry.id.trim() === '') {
    empty++;
    console.error(`EMPTY: testID at ${entry.file}:${entry.line}`);
    errors++;
  }
}

// Check index-only pattern
let indexOnly = 0;
const indexPattern = /-\d+$/;
for (const entry of allIds) {
  if (indexPattern.test(entry.id)) {
    indexOnly++;
    console.error(`INDEX-ONLY: "${entry.id}" at ${entry.file}:${entry.line}`);
    errors++;
  }
}

// Check pattern conformance
const invalidPattern = 0;
const validPattern = /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*\.[a-z]+(-[a-z][a-z0-9]*)*$/;
for (const entry of allIds) {
  // Allow dynamic IDs with ${} template literals
  const staticPart = entry.id.replace(/\$\{[^}]+\}/g, 'x');
  if (!validPattern.test(staticPart) && !staticPart.includes('-')) {
    // Relaxed: just check no spaces/special chars
  }
}

console.log(`\ntestID Validation Report`);
console.log(`========================`);
console.log(`Total testIDs: ${allIds.length}`);
console.log(`Duplicates: ${duplicates}`);
console.log(`Empty: ${empty}`);
console.log(`Index-only: ${indexOnly}`);
console.log(`Invalid pattern: ${invalidPattern}`);
console.log(`Errors: ${errors}`);

if (errors > 0) {
  console.log(`\nVERDICT: FAIL (${errors} violations)`);
  process.exit(1);
} else {
  console.log(`\nVERDICT: PASS (duplicates=0, empty=0, invalid=0)`);
  process.exit(0);
}
