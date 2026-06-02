import * as Crypto from 'expo-crypto';

/**
 * Cryptographically-strong unique id. Falls back to a timestamp+random
 * combo if `expo-crypto.randomUUID` is unavailable (older runtimes / web).
 */
export function generateId(): string {
  if (typeof Crypto.randomUUID === 'function') {
    try {
      return Crypto.randomUUID();
    } catch {
      // fall through to fallback
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
