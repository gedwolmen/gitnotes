import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { NoteSyncQueueService } from '../../services/NoteSyncQueueService';
import type { DroppedMutationEvent } from '../../services/NoteSyncQueueService';
import { ClonePendingQueue } from '../../services/git/ClonePendingQueue';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

// Bounded FIFO so decades of drops cannot grow the dedupe set without limit.
const MAX_ALERTED_IDS = 500;

function dropReasonKey(event: DroppedMutationEvent): string | null {
  if (event.reason === 'exhausted') return 'sync.dropReasonRetries';
  const error = (event.error ?? '').toLowerCase();
  if (event.status === 409 || error.includes('conflict')) return 'sync.dropReasonConflict';
  if (event.status === 401 || event.status === 403 || error.includes('auth')) return 'sync.dropReasonAuth';
  if (event.status === 404 || error.includes('not found')) return 'sync.dropReasonNotFound';
  return null;
}

function alertBody(t: TranslateFn, event: DroppedMutationEvent): string {
  const reasonKey = dropReasonKey(event);
  const base = t('sync.droppedBody');
  return reasonKey ? `${base} ${t(reasonKey)}` : base;
}

/**
 * Centralized surfacing for durably-dropped note mutations (#927). Renders
 * nothing (pure notifier — never blocks pointer events); it only translates
 * `onDroppedMutation` events into a one-time localized alert per mutation.
 */
export function SyncDropNotifier() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  const alertedIdsRef = useRef(new Set<string>());

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (typeof NoteSyncQueueService.onDroppedMutation !== 'function') return;
    const unsubscribe = NoteSyncQueueService.onDroppedMutation((event) => {
      const { mutation } = event;
      if (mutation.type !== 'note.upsert' && mutation.type !== 'note.delete') return;
      if (alertedIdsRef.current.has(mutation.id)) return;
      if (alertedIdsRef.current.size >= MAX_ALERTED_IDS) {
        const oldest = alertedIdsRef.current.values().next().value;
        if (oldest !== undefined) alertedIdsRef.current.delete(oldest);
      }
      alertedIdsRef.current.add(mutation.id);
      Alert.alert(tRef.current('sync.droppedTitle'), alertBody(tRef.current, event));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (typeof ClonePendingQueue?.onDroppedMutation !== 'function') return;
    const unsubClone = ClonePendingQueue.onDroppedMutation((event) => {
      if (alertedIdsRef.current.has(event.id)) return;
      if (alertedIdsRef.current.size >= MAX_ALERTED_IDS) {
        const oldest = alertedIdsRef.current.values().next().value;
        if (oldest !== undefined) alertedIdsRef.current.delete(oldest);
      }
      alertedIdsRef.current.add(event.id);
      Alert.alert(
        tRef.current('sync.droppedTitle'),
        `[Clone] ${event.filePath}: ${event.lastError ?? 'unknown error'} (${event.attempts} attempts)`,
      );
    });
    return unsubClone;
  }, []);

  return null;
}
