/**
 * OAuth 2.0 PKCE utilities for the mobile auth flow.
 *
 * Uses expo-crypto for cryptographically secure random generation.
 * Algorithm is always S256 (SHA-256 code challenge).
 *
 * Does NOT persist credentials. State and code verifier are returned to
 * callers who are responsible for temporal in-memory correlation.
 */

import * as Crypto from 'expo-crypto';

const CODE_VERIFIER_LENGTH = 64; // bytes, encoded as 86-char base64url
const STATE_LENGTH = 32; // bytes, encoded as 43-char base64url

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const byte of bytes) {
    str += String.fromCharCode(byte);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateCodeVerifier(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(CODE_VERIFIER_LENGTH);
  return base64urlEncode(bytes.buffer as ArrayBuffer);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateState(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(STATE_LENGTH);
  return base64urlEncode(bytes.buffer as ArrayBuffer);
}

/**
 * Time-safe comparison of two strings to prevent timing attacks on state.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
