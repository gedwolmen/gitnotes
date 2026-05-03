import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../src/hooks/useNetworkStatus', () => ({
  useNetworkStatus: jest.fn(),
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      error: '#dc2626',
    },
  }),
}));

import { useNetworkStatus } from '../src/hooks/useNetworkStatus';
import { OfflineBanner } from '../src/components/ui/OfflineBanner';

const mockUseNetworkStatus = useNetworkStatus as jest.Mock;

describe('OfflineBanner', () => {
  it('renders when offline', () => {
    mockUseNetworkStatus.mockReturnValue({
      isConnected: false,
      isInternetReachable: false,
    });

    const { getByText } = render(<OfflineBanner />);

    expect(getByText("You're offline — changes won't sync")).toBeTruthy();
  });

  it('hides when online', () => {
    mockUseNetworkStatus.mockReturnValue({
      isConnected: true,
      isInternetReachable: true,
    });

    const { queryByText } = render(<OfflineBanner />);

    expect(queryByText("You're offline — changes won't sync")).toBeNull();
  });
});
