import {
  BYTES_PER_TOKEN,
  DEFAULT_CHAT_BRANCH,
  GITHUB_WRITE_RETRIES,
  MAX_CONTEXT_FILE_BYTES,
  MAX_CONTEXT_TOTAL_BYTES,
  STREAM_RENDER_FLUSH_MS,
} from '../../src/services/ai/config';

describe('ai/config invariants', () => {
  test('per-file budget does not exceed total budget', () => {
    expect(MAX_CONTEXT_FILE_BYTES).toBeLessThanOrEqual(MAX_CONTEXT_TOTAL_BYTES);
  });

  test('all numeric tunables are positive finite', () => {
    for (const value of [
      MAX_CONTEXT_FILE_BYTES,
      MAX_CONTEXT_TOTAL_BYTES,
      GITHUB_WRITE_RETRIES,
      BYTES_PER_TOKEN,
      STREAM_RENDER_FLUSH_MS,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  test('GITHUB_WRITE_RETRIES is small enough to bound latency', () => {
    expect(GITHUB_WRITE_RETRIES).toBeLessThanOrEqual(10);
  });

  test('default chat branch is non-empty', () => {
    expect(typeof DEFAULT_CHAT_BRANCH).toBe('string');
    expect(DEFAULT_CHAT_BRANCH.length).toBeGreaterThan(0);
  });
});
