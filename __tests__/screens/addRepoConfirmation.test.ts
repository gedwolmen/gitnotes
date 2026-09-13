import { Alert } from 'react-native';
import {
  confirmUnverifiedWrite,
  showTransientAccessConfirmation,
} from '@/screens/addRepoConfirmation';

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

const mockT = (key: string) => key;
const mockOnConfirm = jest.fn();
const mockOnRetry = jest.fn();

type AlertCall = [string, string?, Array<{text?: string; onPress?: () => void; style?: string}>?, { onDismiss?: () => void }?];

describe('confirmUnverifiedWrite', () => {
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

  it('sets pendingConfirmationRef to true when shown', () => {
    const ref = { current: false };
    confirmUnverifiedWrite(mockT, mockOnConfirm, Alert.alert, ref);
    expect(ref.current).toBe(true);
  });

  it('shows write-unverified alert with Cancel and Add anyway buttons', () => {
    const ref = { current: false };
    confirmUnverifiedWrite(mockT, mockOnConfirm, Alert.alert, ref);
    expect(alertCalls.length).toBe(1);
    const [title, body, buttons] = alertCalls[0];
    expect(title).toBe('settings.writeAccessNotVerifiedTitle');
    expect(body).toBe('settings.writeAccessNotVerifiedBody');
    expect(buttons![0].text).toBe('common.cancel');
    expect(buttons![0].style).toBe('cancel');
    expect(buttons![1].text).toBe('settings.addAnyway');
  });

  it('onCancel clears pendingConfirmationRef without calling onConfirm', () => {
    const ref = { current: false };
    confirmUnverifiedWrite(mockT, mockOnConfirm, Alert.alert, ref);
    expect(ref.current).toBe(true);
    const cancelBtn = alertCalls[0][2]!.find(b => b.text === 'common.cancel');
    cancelBtn!.onPress!();
    expect(ref.current).toBe(false);
    expect(mockOnConfirm).not.toHaveBeenCalled();
  });

  it('onAddAnyway clears pendingConfirmationRef and calls onConfirm', () => {
    const ref = { current: false };
    confirmUnverifiedWrite(mockT, mockOnConfirm, Alert.alert, ref);
    expect(ref.current).toBe(true);
    const addAnywayBtn = alertCalls[0][2]!.find(b => b.text === 'settings.addAnyway');
    addAnywayBtn!.onPress!();
    expect(ref.current).toBe(false);
    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });

  it('onDismiss clears pendingConfirmationRef', () => {
    const ref = { current: false };
    confirmUnverifiedWrite(mockT, mockOnConfirm, Alert.alert, ref);
    expect(ref.current).toBe(true);
    const dismissHandler = alertCalls[0][3]?.onDismiss;
    dismissHandler?.();
    expect(ref.current).toBe(false);
  });

  it('works without pendingConfirmationRef — onAddAnyway calls onConfirm', () => {
    confirmUnverifiedWrite(mockT, mockOnConfirm, Alert.alert);
    const addAnywayBtn = alertCalls[0][2]!.find(b => b.text === 'settings.addAnyway');
    addAnywayBtn!.onPress!();
    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('showTransientAccessConfirmation', () => {
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

  it('sets pendingConfirmationRef to true when shown', () => {
    const ref = { current: false };
    showTransientAccessConfirmation(mockT, Alert.alert, ref, mockOnRetry);
    expect(ref.current).toBe(true);
  });

  it('shows transient alert with Cancel and Retry buttons', () => {
    const ref = { current: false };
    showTransientAccessConfirmation(mockT, Alert.alert, ref, mockOnRetry);
    expect(alertCalls.length).toBe(1);
    const [title, body, buttons] = alertCalls[0];
    expect(title).toBe('settings.repositoryAccessTitle');
    expect(body).toBe('settings.transientAccessErrorBody');
    expect(buttons![0].text).toBe('common.cancel');
    expect(buttons![0].style).toBe('cancel');
    expect(buttons![1].text).toBe('common.retry');
  });

  it('onCancel clears pendingConfirmationRef without calling onRetry', () => {
    const ref = { current: false };
    showTransientAccessConfirmation(mockT, Alert.alert, ref, mockOnRetry);
    expect(ref.current).toBe(true);
    const cancelBtn = alertCalls[0][2]!.find(b => b.text === 'common.cancel');
    cancelBtn!.onPress!();
    expect(ref.current).toBe(false);
    expect(mockOnRetry).not.toHaveBeenCalled();
  });

  it('onRetry clears pendingConfirmationRef and calls onRetry', () => {
    const ref = { current: false };
    showTransientAccessConfirmation(mockT, Alert.alert, ref, mockOnRetry);
    expect(ref.current).toBe(true);
    const retryBtn = alertCalls[0][2]!.find(b => b.text === 'common.retry');
    retryBtn!.onPress!();
    expect(ref.current).toBe(false);
    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });
});
