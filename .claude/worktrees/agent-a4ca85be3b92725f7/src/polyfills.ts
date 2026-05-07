// Hermes/RN doesn't ship Node globals. isomorphic-git's UMD bundle (which
// metro.config.js redirects to) expects a global `Buffer`. Stash one before
// any git module loads. Importing this from App.tsx's first line guarantees
// the polyfill runs before the bundler evaluates any isomorphic-git code.
import { Buffer } from 'buffer';

if (typeof (globalThis as { Buffer?: unknown }).Buffer === 'undefined') {
  (globalThis as { Buffer: typeof Buffer }).Buffer = Buffer;
}
