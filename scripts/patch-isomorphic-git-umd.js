#!/usr/bin/env node
/**
 * Applies a deterministic string patch to isomorphic-git's minified UMD bundle
 * (`index.umd.min.js`), which the app bundles via metro.config.js's
 * resolveRequest redirect. patch-package cannot apply a diff to this file
 * (it is one giant minified line, so the diff is the whole file and `patch`
 * refuses it), so we do a targeted string replacement instead.
 *
 * The patch inserts a macrotask yield every 256 objects inside
 * `GitPackIndex.fromPack`'s delta-resolution loop, letting the JS thread
 * service RN render/touch dispatch during large-repo clone pack indexing
 * (fixes the add-repo clone freeze — see .omo/plans/fix-clone-phase-freeze.md).
 *
 * Idempotent: skips if already applied. Fails loudly if the anchor string is
 * not found (e.g. after an isomorphic-git upgrade) so CI/install catches it.
 */
const fs = require('fs');
const path = require('path');

const target = path.resolve(
  __dirname,
  '../node_modules/isomorphic-git/index.umd.min.js',
);

const anchor = '}),p++,d=e;const i=n[t];if(!i.oid)try{';
const replacement =
  '}),p++,d=e,p%256===0&&await new Promise(e=>setTimeout(e,0));const i=n[t];if(!i.oid)try{';

if (!fs.existsSync(target)) {
  console.error('[patch-isomorphic-git-umd] missing', target);
  process.exit(1);
}

const source = fs.readFileSync(target, 'utf8');

if (source.includes('p%256===0&&await new Promise')) {
  console.log('[patch-isomorphic-git-umd] already applied — skipping');
  process.exit(0);
}

if (!source.includes(anchor)) {
  console.error(
    '[patch-isomorphic-git-umd] anchor not found — isomorphic-git may have ' +
      'been upgraded. Regenerate the anchor in scripts/patch-isomorphic-git-umd.js.',
  );
  process.exit(1);
}

fs.writeFileSync(target, source.replace(anchor, replacement));
console.log('[patch-isomorphic-git-umd] patched delta-resolution loop');
