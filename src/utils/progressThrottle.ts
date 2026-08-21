export type ProgressEmitter = (phase: string, loaded: number, total: number | null) => void;

interface PendingProgress {
  phase: string;
  loaded: number;
  total: number | null;
}

/**
 * Coalesces progress emissions to at most one per intervalMs. A phase change
 * emits immediately; otherwise the latest values are stashed until flush().
 */
export function createThrottledEmitter(
  emit: ProgressEmitter,
  intervalMs = 200,
): { push: ProgressEmitter; flush: () => void } {
  let lastPhase: string | null = null;
  let lastEmitAt = 0;
  let pending: PendingProgress | null = null;

  const push: ProgressEmitter = (phase, loaded, total) => {
    pending = { phase, loaded, total };
    const now = Date.now();
    if (phase !== lastPhase || now - lastEmitAt >= intervalMs) {
      lastPhase = phase;
      lastEmitAt = now;
      pending = null;
      emit(phase, loaded, total);
    }
  };

  const flush = (): void => {
    if (pending === null) return;
    const { phase, loaded, total } = pending;
    pending = null;
    emit(phase, loaded, total);
  };

  return { push, flush };
}
