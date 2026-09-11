import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useForegroundSyncAlert } from '@/hooks/useForegroundSyncAlert';
import { useForegroundSyncHealth } from '@/hooks/useForegroundSyncHealth';

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { name?: string }) => `${key}:${values?.name ?? ''}`,
  }),
}));

jest.mock('@/hooks/useForegroundSyncHealth', () => ({
  useForegroundSyncHealth: jest.fn(),
}));

const health = useForegroundSyncHealth as jest.MockedFunction<typeof useForegroundSyncHealth>;
const alert = Alert.alert as jest.MockedFunction<typeof Alert.alert>;

function setHealth(status: 'idle' | 'syncing' | 'ok' | 'failed' | 'timedout', consecutiveFailures: number, lastFailedAt = 0) {
  health.mockReturnValue({
    status,
    lastRunAt: 1,
    lastCompletedAt: status === 'ok' ? 2 : 0,
    lastFailedAt,
    consecutiveFailures,
  });
}

describe('useForegroundSyncAlert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setHealth('idle', 0);
  });

  it('alerts once for a failed sync streak', () => {
    setHealth('failed', 1, 100);
    const rendered = renderHook(() => useForegroundSyncAlert());

    expect(alert).toHaveBeenCalledTimes(1);

    setHealth('failed', 2, 200);
    act(() => rendered.rerender());

    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('alerts again after a successful sync resets the streak', () => {
    setHealth('failed', 1, 100);
    const rendered = renderHook(() => useForegroundSyncAlert());

    setHealth('ok', 0);
    act(() => rendered.rerender());
    setHealth('failed', 1, 300);
    act(() => rendered.rerender());

    expect(alert).toHaveBeenCalledTimes(2);
  });

  it('alerts when a sync times out', () => {
    setHealth('timedout', 1, 100);
    renderHook(() => useForegroundSyncAlert());

    expect(alert).toHaveBeenCalledWith('settings.autoSyncFailedTitle:', 'settings.autoSyncFailedBody:GitHub');
  });
});
