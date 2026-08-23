jest.mock('../src/services/ai/config', () => ({
  STREAM_RENDER_FLUSH_MS: 80,
  BYTES_PER_TOKEN: 4,
}));

const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

type TimerFactory = (text: string, pendingFlush: ReturnType<typeof setTimeout> | null) => {
  delay: number;
};

function makeScheduleFlush() {
  let assistantText = '';
  let pendingFlush: ReturnType<typeof setTimeout> | null = null;
  const flushAssistantText = () => {
    pendingFlush = null;
  };
  const scheduleFlush = () => {
    if (pendingFlush) return;
    const scale = 1 + Math.floor(assistantText.length / 2000);
    pendingFlush = setTimeout(flushAssistantText, 80 * scale) as unknown as ReturnType<typeof setTimeout>;
  };
  return {
    append(text: string) {
      assistantText += text;
    },
    schedule: scheduleFlush,
    get pending() {
      return pendingFlush;
    },
    setPending(v: ReturnType<typeof setTimeout> | null) {
      pendingFlush = v;
    },
    get length() {
      return assistantText.length;
    },
  };
}

describe('chat streaming adaptive flush interval (bug-hunt loop3 #13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTimeoutSpy.mockClear();
  });

  it('uses the base interval while the response is short (<2000 chars)', () => {
    const s = makeScheduleFlush();
    s.append('hello world');
    s.schedule();
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 80);
  });

  it('scales the interval with accumulated length (long responses)', () => {
    const s = makeScheduleFlush();
    s.append('x'.repeat(5000));
    s.schedule();
    // scale = 1 + floor(5000/2000) = 3 → 240ms
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 240);

    s.setPending(null);
    s.append('y'.repeat(6000));
    s.schedule();
    // scale = 1 + floor(11000/2000) = 6 → 480ms
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 480);
  });

  it('does not stack multiple pending flushes', () => {
    const s = makeScheduleFlush();
    s.append('text');
    s.schedule();
    const callsAfterFirst = setTimeoutSpy.mock.calls.length;
    s.schedule();
    s.schedule();
    expect(setTimeoutSpy.mock.calls.length).toBe(callsAfterFirst);
  });
});
