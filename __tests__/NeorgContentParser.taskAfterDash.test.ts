import { NeorgContentParser } from '../src/services/NeorgContentParser';

describe('NeorgContentParser task syntax after "- " (issue #659)', () => {
  test.each([
    ['- ( ) Audit copy by 2026-05-30', ' ', 'todo'],
    ['- (x) Sunset legacy segment', 'x', 'done'],
    ['- (-) Win-back sequence v3', '-', 'cancelled'],
    ['- (!) Important review', '!', 'important'],
    ['- (?) Uncertain plan', '?', 'uncertain'],
    ['- (~) In progress draft', '~', 'in-progress'],
  ])('parses %p as a task with status', (input, _marker, expectedStatus) => {
    const item = NeorgContentParser.parseListItem(input);
    expect(item).not.toBeNull();
    expect(item!.type).toBe('task');
    expect(item!.status).toBe(expectedStatus);
  });

  test('strips the (status) marker out of the rendered text', () => {
    const item = NeorgContentParser.parseListItem('- ( ) Audit copy by 2026-05-30');
    expect(item!.text).toBe('Audit copy by 2026-05-30');
  });

  test('still parses a regular dash list item', () => {
    const item = NeorgContentParser.parseListItem('- not a task, just a bullet');
    expect(item).not.toBeNull();
    expect(item!.type).toBe('unordered');
    expect(item!.text).toBe('not a task, just a bullet');
  });

  test('handles indented "- ( )" task', () => {
    const item = NeorgContentParser.parseListItem('  - ( ) nested task');
    expect(item).not.toBeNull();
    expect(item!.type).toBe('task');
    expect(item!.status).toBe('todo');
    expect(item!.text).toBe('nested task');
  });
});
