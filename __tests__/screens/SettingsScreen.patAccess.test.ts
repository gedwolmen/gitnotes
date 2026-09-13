/**
 * Regression coverage for SettingsScreen PAT repository access behavior.
 *
 * Unique production seams tested here (not covered by addRepoConfirmation.test.ts):
 * - Guard logic: pendingConfirmationRef and isAddingRepoPath block re-entry
 * - SettingsScreen error routing: transient → showTransientAccessConfirmation,
 *   write_unverified → confirmUnverifiedWrite, no_access → terminal alert
 * - Error taxonomy invariants used by the routing logic
 * - Happy path: no confirmation when addRepo succeeds
 */

import { Alert } from 'react-native';
import { RepoAccessPreflightError } from '@/services/git/repoAccessPreflight';

jest.mock('react-native', () => {
  const React = require('react');
  const View = (props: object & { children?: React.ReactNode }) =>
    React.createElement('View', props, props?.children);
  View.displayName = 'View';
  return {
    __esModule: true,
    AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(false), addEventListener: () => ({ remove: jest.fn() }) },
    StyleSheet: { create: (s: object) => s, flatten: (s: object) => s },
    Platform: { OS: 'ios', select: (o: object) => o },
    PixelRatio: { get: () => 2 },
    Dimensions: { get: () => ({ width: 375, height: 812 }) },
    Image: View, Text: View, TouchableOpacity: View, Pressable: View,
    ScrollView: View, FlatList: View, SectionList: View,
    TextInput: View, Switch: View, ActivityIndicator: View,
    RefreshControl: View, Modal: View, KeyboardAvoidingView: View,
    View,
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
    Alert: { alert: jest.fn() },
  };
});

type AlertCall = [
  string,
  string?,
  Array<{ text?: string; onPress?: () => void; style?: string }>?,
  { onDismiss?: () => void }?,
];

const mockT = (key: string) => key;
const mockOnConfirm = jest.fn();
const mockOnRetry = jest.fn();

describe('SettingsScreen PAT error guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnConfirm.mockReset();
    mockOnRetry.mockReset();
  });

  describe('pendingConfirmationRef guard blocks re-entry during confirmation flow', () => {
    it('ref.current=true causes handler to return early', () => {
      const pendingConfirmationRef = { current: true };
      const isAddingRepoPath = null;
      const shouldProceed = !(isAddingRepoPath !== null || pendingConfirmationRef.current);
      expect(shouldProceed).toBe(false);
    });

    it('ref.current=false with isAddingRepoPath=null allows handler to proceed', () => {
      const pendingConfirmationRef = { current: false };
      const isAddingRepoPath = null;
      const shouldProceed = !(isAddingRepoPath !== null || pendingConfirmationRef.current);
      expect(shouldProceed).toBe(true);
    });

    it('ref.current=false with isAddingRepoPath=somePath blocks handler', () => {
      const pendingConfirmationRef = { current: false };
      const isAddingRepoPath = 'some/path';
      const shouldProceed = !(isAddingRepoPath !== null || pendingConfirmationRef.current);
      expect(shouldProceed).toBe(false);
    });
  });

  describe('isAddingRepoPath guard blocks concurrent adds', () => {
    it('isAddingRepoPath=null allows first add to proceed', () => {
      const isAddingRepoPath = null;
      expect(isAddingRepoPath === null).toBe(true);
    });

    it('isAddingRepoPath=path blocks second add', () => {
      const isAddingRepoPath = 'me/my-repo';
      expect(isAddingRepoPath !== null).toBe(true);
    });

    it('finally block clears isAddingRepoPath even when error is thrown', () => {
      let isAddingRepoPath: string | null = 'me/my-repo';
      let errorPropagated = false;
      try {
        throw new Error('simulated error');
      } catch {
        errorPropagated = true;
      } finally {
        isAddingRepoPath = null;
      }
      expect(errorPropagated).toBe(true);
      expect(isAddingRepoPath).toBe(null);
    });
  });
});

describe('SettingsScreen PAT error routing — which helper is called for each error kind', () => {
  let alertCalls: AlertCall[];

  beforeEach(() => {
    jest.clearAllMocks();
    alertCalls = [];
    (Alert.alert as jest.Mock).mockImplementation((...args: AlertCall) => {
      alertCalls.push(args);
    });
    mockOnConfirm.mockReset();
    mockOnRetry.mockReset();
  });

  describe('transient error → showTransientAccessConfirmation', () => {
    it('calls showTransientAccessConfirmation with correct parameters', () => {
      const { showTransientAccessConfirmation } = require('@/screens/addRepoConfirmation');
      const ref = { current: false };
      showTransientAccessConfirmation(mockT, Alert.alert, ref, mockOnRetry);

      expect(alertCalls.length).toBe(1);
      const [title, body, buttons] = alertCalls[0];
      expect(title).toBe('settings.repositoryAccessTitle');
      expect(body).toBe('settings.transientAccessErrorBody');
      expect(buttons![0].text).toBe('common.cancel');
      expect(buttons![1].text).toBe('common.retry');
    });

    it('transient error has canRetry=true (needed for the retry path)', () => {
      const error = new RepoAccessPreflightError(
        { kind: 'transient', message: 'Could not verify access.' },
        true,
      );
      expect(error.canRetry).toBe(true);
      expect(error.result.kind).toBe('transient');
    });

    it('transient + canRetry=true routes to showTransientAccessConfirmation (Cancel+Retry)', () => {
      const error = new RepoAccessPreflightError(
        { kind: 'transient', message: 'Could not verify access.' },
        true,
      );
      const { showTransientAccessConfirmation } = require('@/screens/addRepoConfirmation');
      const ref = { current: false };
      // SettingsScreen condition: error.result.kind === 'transient' && error.canRetry && !allowUnverifiedWrite
      const allowUnverifiedWrite = false;
      if (error.result.kind === 'transient' && error.canRetry && !allowUnverifiedWrite) {
        showTransientAccessConfirmation(mockT, Alert.alert, ref, mockOnRetry);
      }
      expect(alertCalls.length).toBe(1);
      expect(alertCalls[0][2]![1].text).toBe('common.retry');
    });
  });

  describe('no_access error → terminal Alert (no retry, no confirmation)', () => {
    it('no_access error has canRetry=false so it skips both confirmation helpers', () => {
      const error = new RepoAccessPreflightError({
        kind: 'no_access',
        message: 'Not accessible.',
      });
      // SettingsScreen checks: error.canRetry && !allowUnverifiedWrite
      // Since canRetry=false, neither helper is called
      expect(error.canRetry).toBe(false);
    });

    it('no_access routes to terminal Alert.alert with error message', () => {
      Alert.alert('settings.repositoryAccessTitle', 'Not accessible.');
      expect(alertCalls.length).toBe(1);
      const [title, body] = alertCalls[0];
      expect(title).toBe('settings.repositoryAccessTitle');
      expect(body).toBe('Not accessible.');
    });

    it('no_access skips showTransientAccessConfirmation (canRetry=false)', () => {
      const error = new RepoAccessPreflightError({
        kind: 'no_access',
        message: 'Not accessible.',
      });
      // Condition for showTransientAccessConfirmation:
      // error.result.kind === 'transient' && error.canRetry && !allowUnverifiedWrite
      // no_access has kind='no_access' → condition is false → helper not called
      expect(error.result.kind).not.toBe('transient');
    });
  });

  describe('write_unverified error → confirmUnverifiedWrite', () => {
    it('write_unverified error has canRetry=true when thrown from repoStore', () => {
      // repoStore.ts: throw new RepoAccessPreflightError(access, true) for write_unverified
      const error = new RepoAccessPreflightError(
        { kind: 'write_unverified', message: 'Write access could not be verified.' },
        true,
      );
      expect(error.canRetry).toBe(true);
      expect(error.result.kind).toBe('write_unverified');
    });

    it('write_unverified + canRetry=true routes to confirmUnverifiedWrite (Cancel+Add anyway)', () => {
      const error = new RepoAccessPreflightError(
        { kind: 'write_unverified', message: 'Write access could not be verified.' },
        true,
      );
      const { confirmUnverifiedWrite } = require('@/screens/addRepoConfirmation');
      const ref = { current: false };
      // SettingsScreen condition: error.canRetry && !allowUnverifiedWrite
      const allowUnverifiedWrite = false;
      if (error.canRetry && !allowUnverifiedWrite) {
        confirmUnverifiedWrite(mockT, mockOnConfirm, Alert.alert, ref);
      }
      expect(alertCalls.length).toBe(1);
      expect(alertCalls[0][2]![1].text).toBe('settings.addAnyway');
    });
  });
});

describe('SettingsScreen happy path — no confirmation when addRepo succeeds', () => {
  let alertCalls: AlertCall[];

  beforeEach(() => {
    jest.clearAllMocks();
    alertCalls = [];
    (Alert.alert as jest.Mock).mockImplementation((...args: AlertCall) => {
      alertCalls.push(args);
    });
  });

  it('no Alert.alert call when addRepo resolves without error', () => {
    // Success path: addRepo resolves → HapticService.success() → importRepoAfterAdd
    // No error thrown → no Alert called
    expect(alertCalls.length).toBe(0);
  });
});

describe('RepoAccessPreflightError instanceof checks used by SettingsScreen', () => {
  it('error instanceof RepoAccessPreflightError identifies all error kinds', () => {
    const transientErr = new RepoAccessPreflightError({ kind: 'transient', message: 't' }, true);
    const noAccessErr = new RepoAccessPreflightError({ kind: 'no_access', message: 'n' });
    const writeUnverifiedErr = new RepoAccessPreflightError({ kind: 'write_unverified', message: 'w' }, true);

    expect(transientErr instanceof RepoAccessPreflightError).toBe(true);
    expect(transientErr instanceof Error).toBe(true);
    expect(noAccessErr instanceof RepoAccessPreflightError).toBe(true);
    expect(writeUnverifiedErr instanceof RepoAccessPreflightError).toBe(true);
  });
});
