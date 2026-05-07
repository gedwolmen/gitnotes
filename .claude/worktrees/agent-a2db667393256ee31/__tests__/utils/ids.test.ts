jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
}));

import * as Crypto from 'expo-crypto';
import { generateId } from '../../src/utils/ids';

const cryptoRef = Crypto as unknown as { randomUUID: unknown };
const originalRandomUUID = cryptoRef.randomUUID;

describe('generateId', () => {
  beforeEach(() => {
    cryptoRef.randomUUID = originalRandomUUID;
    if (typeof originalRandomUUID === 'function') {
      (originalRandomUUID as jest.Mock).mockReset();
    }
  });

  test('uses Crypto.randomUUID when available', () => {
    (Crypto.randomUUID as jest.Mock).mockReturnValue('uuid-123');
    expect(generateId()).toBe('uuid-123');
  });

  test('falls back when Crypto.randomUUID throws', () => {
    (Crypto.randomUUID as jest.Mock).mockImplementation(() => {
      throw new Error('boom');
    });
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });

  test('falls back when Crypto.randomUUID is missing', () => {
    cryptoRef.randomUUID = undefined;
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });

  test('fallback ids are not equal across consecutive calls', () => {
    cryptoRef.randomUUID = undefined;
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });
});
