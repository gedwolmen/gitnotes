// Hermes/RN doesn't ship Node globals. polyfill for Node globals.
// Importing this from App.tsx's first line guarantees the polyfill runs.
import { Buffer } from 'buffer';

if (typeof (globalThis as { Buffer?: unknown }).Buffer === 'undefined') {
  (globalThis as { Buffer: typeof Buffer }).Buffer = Buffer;
}
