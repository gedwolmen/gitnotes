/**
 * Yields the JS thread to the macrotask queue for one turn.
 *
 * React Native's render + touch dispatch are macrotask-driven, so a long
 * run of microtask-only `await` continuations (e.g. a batch of
 * `Promise.all`-joined git reads) starves the UI. Awaiting this between
 * batches gives RN a slot to render and process taps.
 */
export const yieldToMain = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
