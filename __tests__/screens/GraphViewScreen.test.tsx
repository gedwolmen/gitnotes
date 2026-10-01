import { describe, expect, it } from '@jest/globals';
import { getGraphContentTopInset, getGraphViewportStyle } from '../../src/screens/graphViewLayout';

describe('GraphViewScreen layout', () => {
  it('reserves the screen header before graph content starts', () => {
    expect(getGraphContentTopInset(84)).toBe(84);
    expect(getGraphContentTopInset(-1)).toBe(0);
  });

  it('clips the transformed graph viewport so it cannot intercept controls above it', () => {
    expect(getGraphViewportStyle()).toEqual({ overflow: 'hidden' });
  });
});
