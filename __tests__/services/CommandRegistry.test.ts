import { registerCommand, getCommands, searchCommands, Command } from '../../src/services/CommandRegistry';

describe('CommandRegistry', () => {
  beforeEach(() => {
    // Clear and re-register defaults
  });
  
  test('getCommands returns pre-registered commands', () => {
    const cmds = getCommands();
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds.find(c => c.id === 'note.new')).toBeDefined();
  });
  
  test('registerCommand adds new command', () => {
    const initial = getCommands().length;
    registerCommand({
      id: 'test.cmd',
      label: 'Test Command',
      category: 'Test',
      action: () => {},
    });
    expect(getCommands().length).toBe(initial + 1);
  });
  
  test('searchCommands filters by label', () => {
    const results = searchCommands('note');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(c => c.label.toLowerCase().includes('note'))).toBe(true);
  });
  
  test('searchCommands returns all when query is empty', () => {
    expect(searchCommands('').length).toBe(getCommands().length);
  });
});
