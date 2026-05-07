import { buildSystemPrompt } from '../../src/services/ai/systemPrompt';

describe('buildSystemPrompt', () => {
  test('always includes the base assistant identity', () => {
    const prompt = buildSystemPrompt({
      noteCount: 0,
      todoCount: 0,
      actionMode: 'auto',
    });
    expect(prompt).toContain('GitNotes AI');
  });

  test('omits confirm-mode guidance in auto mode', () => {
    const prompt = buildSystemPrompt({
      noteCount: 1,
      todoCount: 2,
      actionMode: 'auto',
    });
    expect(prompt).not.toContain('wait for user confirmation');
  });

  test('emits confirm-mode guidance in confirm mode', () => {
    const prompt = buildSystemPrompt({
      noteCount: 1,
      todoCount: 2,
      actionMode: 'confirm',
    });
    expect(prompt).toContain('IMPORTANT');
    expect(prompt).toContain('wait for user confirmation');
  });

  test('embeds attached context inside delimiters when provided', () => {
    const prompt = buildSystemPrompt({
      noteCount: 0,
      todoCount: 0,
      actionMode: 'auto',
      attachedContexts: 'FILE A\nFILE B',
    });
    expect(prompt).toContain('=== User-Provided Context ===');
    expect(prompt).toContain('=== End Context ===');
    expect(prompt).toContain('FILE A');
    expect(prompt).toContain('FILE B');
  });

  test('omits the context block when attachedContexts is empty/undefined', () => {
    const prompt = buildSystemPrompt({
      noteCount: 0,
      todoCount: 0,
      actionMode: 'auto',
    });
    expect(prompt).not.toContain('User-Provided Context');
  });

  test('reports current note and todo counts', () => {
    const prompt = buildSystemPrompt({
      noteCount: 7,
      todoCount: 13,
      actionMode: 'auto',
    });
    expect(prompt).toContain('7 notes');
    expect(prompt).toContain('13 todos');
  });
});
