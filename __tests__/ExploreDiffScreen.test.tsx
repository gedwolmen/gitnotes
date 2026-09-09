import { describe, expect, it } from '@jest/globals';

declare const __dirname: string;
declare const require: (moduleName: string) => {
  readFileSync: (path: string, encoding: string) => string;
};

const { readFileSync } = require('fs');

describe('ExploreDiffScreen stage action', () => {
  it('keeps the stage action label inside a Text component', () => {
    const source = readFileSync(`${__dirname}/../src/screens/ExploreDiffScreen.tsx`, 'utf8');

    expect(source).toContain('<ButtonText>Stage selected</ButtonText>');
    expect(source).not.toMatch(/\n\s+Stage selected\n/);
  });
});
