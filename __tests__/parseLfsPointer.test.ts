import { parseLfsPointer } from '../src/services/git/lfs';

describe('parseLfsPointer', () => {
  const VALID = `version https://git-lfs.github.com/spec/v1
oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393
size 12345
`;

  test('parses a valid pointer', () => {
    const ptr = parseLfsPointer(VALID);
    expect(ptr).toEqual({
      oid: '4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393',
      size: 12345,
    });
  });

  test('parses a valid pointer from a Uint8Array', () => {
    const bytes = new Uint8Array(VALID.length);
    for (let i = 0; i < VALID.length; i++) bytes[i] = VALID.charCodeAt(i);
    expect(parseLfsPointer(bytes)).toEqual({
      oid: '4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393',
      size: 12345,
    });
  });

  test('rejects non-pointer text', () => {
    expect(parseLfsPointer('# Hello\nThis is a regular markdown file.')).toBeNull();
  });

  test('rejects pointer with bad oid format', () => {
    const bad = `version https://git-lfs.github.com/spec/v1
oid sha256:not_hex
size 100
`;
    expect(parseLfsPointer(bad)).toBeNull();
  });

  test('rejects pointer with missing version line', () => {
    const bad = `oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393
size 100
`;
    expect(parseLfsPointer(bad)).toBeNull();
  });

  test('rejects pointer with negative size', () => {
    const bad = `version https://git-lfs.github.com/spec/v1
oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393
size -1
`;
    // -1 has '-' which fails the SIZE_REGEX pattern (\d+ only)
    expect(parseLfsPointer(bad)).toBeNull();
  });

  test('rejects oversize input (> 2KiB) cheaply', () => {
    const big = VALID + 'x'.repeat(3000);
    expect(parseLfsPointer(big)).toBeNull();
  });

  test('rejects binary-looking input (bytes > 0x7f)', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    expect(parseLfsPointer(bytes)).toBeNull();
  });

  test('handles size=0 LFS pointer', () => {
    const zero = `version https://git-lfs.github.com/spec/v1
oid sha256:0000000000000000000000000000000000000000000000000000000000000000
size 0
`;
    expect(parseLfsPointer(zero)).toEqual({
      oid: '0000000000000000000000000000000000000000000000000000000000000000',
      size: 0,
    });
  });
});
