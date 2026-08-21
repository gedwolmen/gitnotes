import { yieldToMain } from '../../src/utils/yieldToMain';

describe('yieldToMain', () => {
  it('yields via a single setTimeout(0) and resolves', async () => {
    const spy = jest.spyOn(global, 'setTimeout');
    const promise = yieldToMain();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 0);
    await expect(promise).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('creates no other timers', async () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    await yieldToMain();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });
});
