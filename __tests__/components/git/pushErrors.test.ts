import { describe, expect, it } from '@jest/globals';
import { classifyPushError } from '../../../src/components/git/pushErrors';

describe('classifyPushError', () => {
  it('classifies a missing remote branch as a push rejection, not authentication', () => {
    const failure = classifyPushError(new Error('remote ref refs/heads/master not found'));

    expect(failure.kind).toBe('rejected');
    expect(failure.message).toContain('refs/heads/master not found');
  });
});
