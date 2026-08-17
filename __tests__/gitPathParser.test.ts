import { parseRepoPath } from '../src/utils/gitPathParser';

describe('parseRepoPath', () => {
  const cases: Array<{ input: string; expected: { owner: string; repo: string } | null }> = [
    { input: 'facebook/react', expected: { owner: 'facebook', repo: 'react' } },
    { input: 'github.com/facebook/react', expected: { owner: 'facebook', repo: 'react' } },
    { input: 'https://github.com/facebook/react', expected: { owner: 'facebook', repo: 'react' } },
    { input: 'http://github.com/facebook/react', expected: { owner: 'facebook', repo: 'react' } },
    { input: 'facebook/react.git', expected: { owner: 'facebook', repo: 'react' } },
    { input: 'vidwadeseram/test-notes.git/', expected: { owner: 'vidwadeseram', repo: 'test-notes' } },
    { input: 'git@github.com:vidwadeseram/test-notes.git', expected: { owner: 'vidwadeseram', repo: 'test-notes' } },
    { input: 'git@github.com:vidwadeseram/test-notes.git/', expected: { owner: 'vidwadeseram', repo: 'test-notes' } },
    { input: 'git@github.com:vidwadeseram/test-notes', expected: { owner: 'vidwadeseram', repo: 'test-notes' } },
    { input: 'ssh://git@github.com/vidwadeseram/test-notes.git', expected: { owner: 'vidwadeseram', repo: 'test-notes' } },
    { input: '  https://github.com/a/b.git/  ', expected: { owner: 'a', repo: 'b' } },
    { input: 'github.com/owner/repo/subdir', expected: { owner: 'owner', repo: 'repo' } },
    { input: 'https://github.com/owner/repo/', expected: { owner: 'owner', repo: 'repo' } },
    { input: 'owner/repo', expected: { owner: 'owner', repo: 'repo' } },
  ];

  it.each(cases)('parses "$input"', ({ input, expected }) => {
    expect(parseRepoPath(input)).toEqual(expected);
  });

  const invalidCases = [
    '',
    '   ',
    'nope',
    'github.com',
    'https://github.com',
    '/owner/repo',
    'git@github.com:onlyowner',
    '@:bad/repo',
    'foo:@bar/repo',
  ];

  it.each(invalidCases)('returns null for "%s"', (input) => {
    expect(parseRepoPath(input)).toBeNull();
  });
});
