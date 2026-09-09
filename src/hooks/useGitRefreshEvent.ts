import { useEffect, useRef, useReducer } from 'react';

/**
 * Simple event emitter for signaling git status refresh across hooks.
 * useAllReposStatus emits after stage/commit/push operations.
 * useGitRepoStatus listens to stay in sync.
 */

type GitRefreshListener = () => void;

const listeners = new Set<GitRefreshListener>();
const contentListeners = new Set<GitRefreshListener>();

export function emitGitRefresh(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeGitRefresh(listener: GitRefreshListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitGitContentRefresh(): void {
  contentListeners.forEach((listener) => listener());
}

export function subscribeGitContentRefresh(listener: GitRefreshListener): () => void {
  contentListeners.add(listener);
  return () => contentListeners.delete(listener);
}

/**
 * Hook for components/hooks to react to git refresh events.
 * Returns a trigger count that increments whenever a refresh is emitted.
 * Components can use this in their useEffect deps to trigger refreshes.
 */
export function useGitRefreshSignal(): number {
  const countRef = useRef(0);
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    const unsubscribe = subscribeGitRefresh(() => {
      countRef.current += 1;
      forceUpdate();
    });
    return unsubscribe;
  }, []);

  return countRef.current;
}

export function useGitContentRefreshSignal(): number {
  const countRef = useRef(0);
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    const unsubscribe = subscribeGitContentRefresh(() => {
      countRef.current += 1;
      forceUpdate();
    });
    return unsubscribe;
  }, []);

  return countRef.current;
}
