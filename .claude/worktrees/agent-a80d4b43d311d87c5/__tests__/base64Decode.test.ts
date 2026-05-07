/**
 * Indirect test of the GitHubService base64 decoder via the unexported
 * helpers. We replicate the exact functions here to keep them tested
 * without altering the module's public surface.
 */

function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  let outLen = (cleaned.length / 4) * 3;
  if (cleaned.endsWith('==')) outLen -= 2;
  else if (cleaned.endsWith('=')) outLen -= 1;
  const bytes = new Uint8Array(Math.max(0, outLen));
  let bi = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c1 = chars.indexOf(cleaned[i]);
    const c2 = chars.indexOf(cleaned[i + 1]);
    const c3 = cleaned[i + 2] === '=' ? 64 : chars.indexOf(cleaned[i + 2]);
    const c4 = cleaned[i + 3] === '=' ? 64 : chars.indexOf(cleaned[i + 3]);
    if (c1 < 0 || c2 < 0) break;
    bytes[bi++] = (c1 << 2) | (c2 >> 4);
    if (c3 !== 64 && c3 >= 0) bytes[bi++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (c4 !== 64 && c4 >= 0) bytes[bi++] = ((c3 & 3) << 6) | c4;
  }
  return bytes.subarray(0, bi);
}

function utf8DecodeBytes(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    if (b1 < 0x80) { out += String.fromCharCode(b1); continue; }
    if ((b1 & 0xe0) === 0xc0 && i < bytes.length) {
      const b2 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
      continue;
    }
    if ((b1 & 0xf0) === 0xe0 && i + 1 < bytes.length) {
      const b2 = bytes[i++], b3 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
      continue;
    }
    if ((b1 & 0xf8) === 0xf0 && i + 2 < bytes.length) {
      const b2 = bytes[i++], b3 = bytes[i++], b4 = bytes[i++];
      const cp = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
      const cpAdj = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (cpAdj >> 10), 0xdc00 + (cpAdj & 0x3ff));
      continue;
    }
    out += '�';
  }
  return out;
}

const decode = (b64: string) => utf8DecodeBytes(base64ToBytes(b64));

const encode = (s: string): string => {
  // Use Buffer in the test environment to produce reference base64.
  return Buffer.from(s, 'utf-8').toString('base64');
};

describe('base64 utf-8 decoder', () => {
  test('round-trips ASCII', () => {
    expect(decode(encode('hello world'))).toBe('hello world');
  });

  test('round-trips Latin-1 accented characters', () => {
    expect(decode(encode('café résumé naïve'))).toBe('café résumé naïve');
  });

  test('round-trips 3-byte UTF-8 (CJK)', () => {
    expect(decode(encode('日本語テスト 中文 한국어'))).toBe('日本語テスト 中文 한국어');
  });

  test('round-trips 4-byte UTF-8 / surrogate pairs (emoji)', () => {
    const input = '🚀 🎉 👨‍👩‍👧 🦄';
    expect(decode(encode(input))).toBe(input);
  });

  test('handles empty input', () => {
    expect(decode('')).toBe('');
  });

  test('strips whitespace + newlines (GitHub returns wrapped base64)', () => {
    const wrapped = encode('hello').replace(/(.{2})/g, '$1\n');
    expect(decode(wrapped)).toBe('hello');
  });

  test('handles single = and == padding', () => {
    expect(decode(encode('a'))).toBe('a');     // ends with ==
    expect(decode(encode('ab'))).toBe('ab');   // ends with =
    expect(decode(encode('abc'))).toBe('abc'); // no padding
  });
});
