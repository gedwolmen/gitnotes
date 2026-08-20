import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render } from '@testing-library/react-native';

import { SyncBlockOverlay } from '../../../src/components/ui/SyncBlockOverlay';
import { TestThemeProvider } from '../../ui/testThemeProvider';
import { GIT_OP_ALL_REPOS } from '../../../src/stores/gitOperationStore';
import type { GitOp } from '../../../src/stores/gitOperationStore';

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */

// Store the selector function so tests can inject ops.
let mockOps: Record<string, GitOp> = {};

jest.mock('../../../src/stores/gitOperationStore', () => ({
  GIT_OP_ALL_REPOS: '*',
  useGitOperationStore: (selector: (s: { ops: Record<string, GitOp> }) => unknown) =>
    selector({ ops: mockOps }),
}));

let mockIsPushActive = false;
jest.mock('../../../src/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    isPushActive: jest.fn(() => mockIsPushActive),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'sync.overlay.syncing': 'Syncing…',
        'sync.overlay.pushing': 'Pushing…',
        'sync.overlay.pulling': 'Pulling…',
      };
      return map[key] ?? key;
    },
  }),
}));

jest.mock('expo-blur', () => {
  const React = require('react');
  return {
    BlurView: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement('BlurView', { ...props, ref }),
    ),
  };
});

const announceSpy = jest
  .spyOn(AccessibilityInfo, 'announceForAccessibility')
  .mockImplementation(() => undefined);

function makeCycleOp(source: string, overrides: Partial<GitOp> = {}): GitOp {
  return {
    id: `op-${source}`,
    kind: 'pull',
    repo: GIT_OP_ALL_REPOS,
    entityIds: [],
    status: 'running',
    createdAt: Date.now(),
    attempts: 0,
    source: source as GitOp['source'],
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <TestThemeProvider>{children}</TestThemeProvider>;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('SyncBlockOverlay', () => {
  beforeEach(() => {
    mockOps = {};
    mockIsPushActive = false;
    announceSpy.mockClear();
  });

  afterAll(() => {
    announceSpy.mockRestore();
  });

  /* --- visibility matrix per source --- */

  it('renders when source is "save" and status is "running"', () => {
    mockOps = { 'op-save': makeCycleOp('save') };
    const { getByTestId } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByTestId('sync-block-overlay')).toBeTruthy();
  });

  it('renders when source is "save" and status is "queued"', () => {
    mockOps = { 'op-save': makeCycleOp('save', { status: 'queued' }) };
    const { getByTestId } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByTestId('sync-block-overlay')).toBeTruthy();
  });

  it('renders when source is "manual" and status is "running"', () => {
    mockOps = { 'op-manual': makeCycleOp('manual') };
    const { getByTestId } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByTestId('sync-block-overlay')).toBeTruthy();
  });

  it('does NOT render overlay when source is "idle"', () => {
    mockOps = { 'op-idle': makeCycleOp('idle') };
    const { getByTestId } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByTestId('sync-block-overlay').props.pointerEvents).toBe('none');
  });

  it('does NOT render overlay when source is "background"', () => {
    mockOps = { 'op-bg': makeCycleOp('background') };
    const { getByTestId } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByTestId('sync-block-overlay').props.pointerEvents).toBe('none');
  });

  it('does NOT render overlay when source is "startup"', () => {
    mockOps = { 'op-startup': makeCycleOp('startup') };
    const { getByTestId } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByTestId('sync-block-overlay').props.pointerEvents).toBe('none');
  });

  it('does NOT render overlay when no ops exist', () => {
    mockOps = {};
    const { getByTestId } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByTestId('sync-block-overlay').props.pointerEvents).toBe('none');
  });

  it('does NOT render overlay for non-cycle push op with source "manual"', () => {
    mockOps = {
      'op-push': makeCycleOp('manual', { kind: 'push', repo: 'owner/repo' }),
    };
    const { getByTestId } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByTestId('sync-block-overlay').props.pointerEvents).toBe('none');
  });

  /* --- pointerEvents --- */

  it('blocks pointer events when a blocking cycle op is active', () => {
    mockOps = { 'op-save': makeCycleOp('save') };
    const { getByTestId } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByTestId('sync-block-overlay').props.pointerEvents).toBe('auto');
  });

  it('ignores pointer events when no blocking cycle op is active', () => {
    mockOps = {};
    const { getByTestId } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByTestId('sync-block-overlay').props.pointerEvents).toBe('none');
  });

  /* --- accessibility --- */

  it('has accessibilityRole="alert"', () => {
    mockOps = { 'op-save': makeCycleOp('save') };
    const { getByTestId } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByTestId('sync-block-overlay').props.accessibilityRole).toBe('alert');
  });

  it('announces "Syncing…" via AccessibilityInfo when visible', () => {
    mockOps = { 'op-save': makeCycleOp('save') };
    render(<SyncBlockOverlay />, { wrapper });
    expect(announceSpy).toHaveBeenCalledWith('Syncing…');
  });

  it('announces "Pushing…" when push markers are active', () => {
    mockIsPushActive = true;
    mockOps = { 'op-save': makeCycleOp('save') };
    render(<SyncBlockOverlay />, { wrapper });
    expect(announceSpy).toHaveBeenCalledWith('Pushing…');
  });

  it('does NOT announce when overlay is not blocking', () => {
    mockOps = {};
    render(<SyncBlockOverlay />, { wrapper });
    expect(announceSpy).not.toHaveBeenCalled();
  });

  /* --- label content --- */

  it('displays "Syncing…" label by default', () => {
    mockOps = { 'op-save': makeCycleOp('save') };
    const { getByText } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByText('Syncing…')).toBeTruthy();
  });

  it('displays "Pushing…" label when push markers are active', () => {
    mockIsPushActive = true;
    mockOps = { 'op-save': makeCycleOp('save') };
    const { getByText } = render(<SyncBlockOverlay />, { wrapper });
    expect(getByText('Pushing…')).toBeTruthy();
  });
});
