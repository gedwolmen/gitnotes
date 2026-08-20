import React from 'react';
import { Alert } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { SyncDropNotifier } from '../../../src/components/git/SyncDropNotifier';
import type {
  DroppedMutationEvent,
  QueuedMutation,
} from '../../../src/services/NoteSyncQueueService';

type DropListener = (event: DroppedMutationEvent) => void;

let mockDropListeners: DropListener[] = [];
const mockUnsubscribe = jest.fn(() => {
  mockDropListeners = [];
});

jest.mock('../../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    onDroppedMutation: jest.fn((listener: DropListener) => {
      mockDropListeners.push(listener);
      return mockUnsubscribe;
    }),
  },
}));

import { NoteSyncQueueService } from '../../../src/services/NoteSyncQueueService';

const DROPPED_TITLE = 'Change saved locally';
const DROPPED_BODY = "Your change is saved locally but couldn't sync. Tap Stage to push.";

function upsertMutation(id: string): QueuedMutation {
  return {
    id,
    createdAt: 1_700_000_000_000,
    attempts: 3,
    type: 'note.upsert',
    params: {
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'notes/a.md',
      title: 'Note A',
      content: 'body',
      format: 'markdown',
    },
  };
}

function deleteMutation(id: string): QueuedMutation {
  return {
    id,
    createdAt: 1_700_000_000_000,
    attempts: 3,
    type: 'note.delete',
    params: { repo: 'owner/repo', branch: 'main', filePath: 'notes/a.md' },
  };
}

function droppedEvent(
  mutation: QueuedMutation,
  overrides: Partial<Pick<DroppedMutationEvent, 'reason' | 'error' | 'status'>> = {},
): DroppedMutationEvent {
  return { mutation, reason: 'durable', error: 'conflict', status: 409, ...overrides };
}

function emit(event: DroppedMutationEvent): void {
  act(() => {
    for (const listener of [...mockDropListeners]) listener(event);
  });
}

describe('SyncDropNotifier', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockDropListeners = [];
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fires exactly one localized alert when a note.upsert mutation is dropped', () => {
    render(<SyncDropNotifier />);

    emit(droppedEvent(upsertMutation('mutation-1')));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      DROPPED_TITLE,
      `${DROPPED_BODY} Sync conflict: the note was modified on GitHub.`,
    );
  });

  it('fires one alert per drop for two distinct drops (upsert conflict + delete auth)', () => {
    render(<SyncDropNotifier />);

    emit(droppedEvent(upsertMutation('mutation-1')));
    emit(
      droppedEvent(deleteMutation('mutation-2'), {
        reason: 'durable',
        error: 'bad credentials',
        status: 401,
      }),
    );

    expect(alertSpy).toHaveBeenCalledTimes(2);
    expect(alertSpy).toHaveBeenNthCalledWith(
      1,
      DROPPED_TITLE,
      `${DROPPED_BODY} Sync conflict: the note was modified on GitHub.`,
    );
    expect(alertSpy).toHaveBeenNthCalledWith(
      2,
      DROPPED_TITLE,
      `${DROPPED_BODY} GitHub authentication failed. Reconnect your account in Settings.`,
    );
  });

  it('unsubscribes on unmount so later drops do not alert', () => {
    const view = render(<SyncDropNotifier />);
    expect(NoteSyncQueueService.onDroppedMutation).toHaveBeenCalledTimes(1);

    view.unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    emit(droppedEvent(upsertMutation('mutation-1')));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('dedupes per mutation id: same drop emitted twice (across a re-render) alerts once', () => {
    const view = render(<SyncDropNotifier />);

    emit(droppedEvent(upsertMutation('mutation-1')));
    view.rerender(<SyncDropNotifier />);
    emit(droppedEvent(upsertMutation('mutation-1')));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(NoteSyncQueueService.onDroppedMutation).toHaveBeenCalledTimes(1);
  });
});
