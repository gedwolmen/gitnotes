/**
 * Micro-benchmark for src/services/git/gitFs.ts writeFile path.
 *
 * The real clone bottleneck is JS-thread CPU saturation. Native bridge
 * roundtrips can't be measured without an iOS device, but the dominant
 * JS-thread costs can be exercised end-to-end here:
 *   1. The base64 encoding (was a per-byte JS loop)
 *   2. The redundant getInfoAsync calls for ancestor directories
 *   3. The bounded setImmediate yield safety net
 *
 * Exercises makeGitFs().writeFile with a representative clone write
 * pattern (hundreds of small packfile objects + a few larger trees) and
 * measures getInfoAsync call count, wall time, and yield firings.
 *
 * Run: yarn test __tests__/bench/gitFs.bench.test.ts
 */

import { performance } from 'node:perf_hooks';

jest.mock('expo-file-system/legacy', () => {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>();
  let getInfoCallCount = 0;
  let writeCallCount = 0;
  const BRIDGE_LATENCY_MS = 0.5;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const mock = {
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    getInfoCallCount: () => getInfoCallCount,
    writeCallCount: () => writeCallCount,
    resetCounters: () => {
      getInfoCallCount = 0;
      writeCallCount = 0;
    },
    resetStore: () => {
      files.clear();
      dirs.clear();
    },
    seedDir: (uri: string) => dirs.add(uri),
    async getInfoAsync(uri: string) {
      getInfoCallCount += 1;
      await sleep(BRIDGE_LATENCY_MS);
      if (dirs.has(uri)) return { exists: true, isDirectory: true };
      if (files.has(uri)) return { exists: true, isDirectory: false, size: files.get(uri)!.length };
      return { exists: false, isDirectory: false };
    },
    async makeDirectoryAsync(uri: string, opts: { intermediates: boolean }) {
      await sleep(BRIDGE_LATENCY_MS);
      if (opts.intermediates) {
        const parts = uri.split('/').filter(Boolean);
        let acc = uri.startsWith('/') ? '/' : '';
        for (const p of parts) {
          acc = acc + p + '/';
          dirs.add(acc);
        }
      } else {
        dirs.add(uri);
      }
    },
    async writeAsStringAsync(uri: string, content: string, opts?: { encoding?: string }) {
      writeCallCount += 1;
      const bytes = opts?.encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
      await sleep(Math.min(2, bytes.length * 0.001));
      files.set(uri, bytes);
    },
    async readAsStringAsync(uri: string, opts?: { encoding?: string }) {
      await sleep(BRIDGE_LATENCY_MS);
      const f = files.get(uri);
      if (!f) throw new Error('ENOENT');
      if (opts?.encoding === 'base64') return Buffer.from(f).toString('base64');
      return Buffer.from(f).toString('utf8');
    },
    async readDirectoryAsync(uri: string) {
      await sleep(BRIDGE_LATENCY_MS);
      return [...dirs]
        .filter((d) => d.startsWith(uri) && d !== uri)
        .map((d) => d.slice(uri.length).split('/')[0]);
    },
    async deleteAsync(uri: string) {
      await sleep(BRIDGE_LATENCY_MS);
      files.delete(uri);
      dirs.delete(uri);
    },
    documentDirectory: 'file:///mock-docs/',
  };
  return mock;
});

 
const { makeGitFs } = require('../../src/services/git/gitFs');
 
const FileSystem = require('expo-file-system/legacy');

const ROOT = 'file:///mock-docs/GitNotes/';
const NUM_OBJECTS = 500;
const PAYLOAD_SIZE = 1024;

function buildObjects() {
  const objects: { path: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < NUM_OBJECTS; i++) {
    const sha = i.toString(16).padStart(40, '0').slice(0, 40);
    const fanout = sha.slice(0, 2);
    objects.push({
      path: `.git/objects/${fanout}/${sha.slice(2)}`,
      bytes: new Uint8Array(PAYLOAD_SIZE).fill(i & 0xff),
    });
  }
  for (let i = 0; i < 20; i++) {
    const sha = i.toString(16).padStart(40, '0').slice(0, 40);
    const fanout = sha.slice(0, 2);
    objects.push({
      path: `.git/objects/${fanout}/tree-${sha.slice(2)}`,
      bytes: new Uint8Array(8192).fill(i & 0xff),
    });
  }
  return objects;
}

describe('gitFs writeFile benchmark', () => {
  jest.setTimeout(30000);

  it('ancestor cache collapses getInfoAsync calls under clone load', async () => {
    const fs = makeGitFs(ROOT).promises;
    FileSystem.resetCounters();
    FileSystem.resetStore();
    FileSystem.seedDir(ROOT);

    const origSetImmediate = globalThis.setImmediate;
    let yieldCount = 0;
    (globalThis as { setImmediate: typeof setImmediate }).setImmediate = ((...args: Parameters<typeof setImmediate>) => {
      yieldCount += 1;
      return (origSetImmediate as (...a: Parameters<typeof setImmediate>) => ReturnType<typeof setImmediate>)(...args);
    }) as typeof setImmediate;

    const objects = buildObjects();
    const t0 = performance.now();
    for (const obj of objects) {
      await fs.writeFile(obj.path, obj.bytes);
      await Promise.resolve();
    }
    const elapsed = performance.now() - t0;

    (globalThis as { setImmediate: typeof setImmediate }).setImmediate = origSetImmediate;

    const getInfoCalls = FileSystem.getInfoCallCount();
    const writeCalls = FileSystem.writeCallCount();
    const getInfoRatio = getInfoCalls / objects.length;
    const totalBytes = objects.reduce((s, o) => s + o.bytes.length, 0);

    console.log('\n=== gitFs writeFile benchmark ===');
    console.log(`Workload:        ${objects.length} writes, ${(totalBytes / 1024).toFixed(0)} KB total`);
    console.log(`Total time:      ${elapsed.toFixed(1)} ms`);
    console.log(`Per-write avg:   ${(elapsed / objects.length).toFixed(3)} ms`);
    console.log(`getInfoAsync:    ${getInfoCalls} (${getInfoRatio.toFixed(2)} per write)`);
    console.log(`writeAsString:   ${writeCalls}`);
    console.log(`setImmediate:    ${yieldCount} (safety-net yields fired)`);

    expect(writeCalls).toBe(objects.length);
    expect(getInfoRatio).toBeLessThan(2);
    expect(yieldCount).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(5000);
  });
});
