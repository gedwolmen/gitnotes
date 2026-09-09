import { describe, expect, it } from '@jest/globals';

declare const __dirname: string;
declare const require: (moduleName: string) => {
  readFileSync: (path: string, encoding: string) => string;
};

const { readFileSync } = require('fs');

describe('ExploreDiffScreen stage action', () => {
  it('uses Button label styling for the primary stage action', () => {
    const source = readFileSync(`${__dirname}/../src/screens/ExploreDiffScreen.tsx`, 'utf8');

    expect(source).toContain("label={staging ? undefined : 'Stage selected'}");
    expect(source).toContain('leadingIcon={staging ? <ActivityIndicator size="small" color="#ffffff" /> : undefined}');
    expect(source).not.toContain('<ButtonText>Stage selected</ButtonText>');
  });

  it('passes native line indices to partial staging', () => {
    const source = readFileSync(`${__dirname}/../src/screens/ExploreDiffScreen.tsx`, 'utf8');
    const engineSource = readFileSync(`${__dirname}/../src/services/git/engine/GitEngine.ts`, 'utf8');

    expect(source).toContain('lineIndices: selectedLines.map((line) => line.index)');
    expect(source).not.toContain('oldStart:');
    expect(engineSource).toContain('type HunkSelection = { lineIndices: number[] };');
  });
});
