import { createThrottledEmitter } from '../../src/utils/progressThrottle';

describe('createThrottledEmitter', () => {
  let now: number;
  let setIntervalSpy: jest.SpyInstance;
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    setIntervalSpy = jest.spyOn(global, 'setInterval');
    setTimeoutSpy = jest.spyOn(global, 'setTimeout');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('coalesces dense events within intervalMs, emitting once per elapsed interval', () => {
    const emit = jest.fn();
    const { push } = createThrottledEmitter(emit, 200);

    push('clone', 0, 10);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith('clone', 0, 10);

    push('clone', 1, 10);
    push('clone', 2, 10);
    push('clone', 3, 10);
    expect(emit).toHaveBeenCalledTimes(1);

    now = 1300;
    push('clone', 4, 10);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith('clone', 4, 10);

    push('clone', 5, 10);
    push('clone', 6, 10);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('emits immediately when the phase changes, even within the interval', () => {
    const emit = jest.fn();
    const { push } = createThrottledEmitter(emit, 200);

    push('pull', 0, 5);
    expect(emit).toHaveBeenCalledTimes(1);

    push('checkout', 1, 5);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith('checkout', 1, 5);

    push('checkout', 2, 5);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('flush() emits the latest stashed values exactly once', () => {
    const emit = jest.fn();
    const { push, flush } = createThrottledEmitter(emit, 200);

    push('pull', 0, 10);
    push('pull', 5, 10);
    push('pull', 9, 10);
    expect(emit).toHaveBeenCalledTimes(1);

    flush();
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith('pull', 9, 10);

    flush();
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('flush() is a no-op when nothing was pushed or nothing is pending', () => {
    const emit = jest.fn();
    const { push, flush } = createThrottledEmitter(emit, 200);

    flush();
    expect(emit).not.toHaveBeenCalled();

    push('pull', 1, 10);
    expect(emit).toHaveBeenCalledTimes(1);
    flush();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('defaults intervalMs to 200', () => {
    const emit = jest.fn();
    const { push } = createThrottledEmitter(emit);

    push('clone', 0, 1);
    expect(emit).toHaveBeenCalledTimes(1);

    push('clone', 1, 1);
    expect(emit).toHaveBeenCalledTimes(1);

    now = 1300;
    push('clone', 2, 1);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('never creates timers during push or flush', () => {
    const emit = jest.fn();
    const { push, flush } = createThrottledEmitter(emit, 200);

    push('pull', 0, 10);
    push('pull', 1, 10);
    push('checkout', 2, 10);
    flush();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});
