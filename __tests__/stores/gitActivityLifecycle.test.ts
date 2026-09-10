import { operationActivityTransition } from '@/stores/gitActivityLifecycle';

describe('git operation activity lifecycle', () => {
  it('starts once and ends once across repeated active updates', () => {
    const first = operationActivityTransition(false, 1);
    const repeated = operationActivityTransition(first.active, 1);
    const completed = operationActivityTransition(repeated.active, 0);

    expect(first.action).toBe('begin');
    expect(repeated.action).toBe('none');
    expect(completed.action).toBe('end');
    expect(completed.active).toBe(false);
  });
});
