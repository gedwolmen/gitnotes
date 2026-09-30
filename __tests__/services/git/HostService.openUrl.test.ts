jest.mock('react-native', () => ({
  Linking: {
    openURL: jest.fn(() => Promise.resolve()),
  },
}));

import { Linking } from 'react-native';
import { HostService } from '@/services/git/HostService';

describe('HostService.openUrl', () => {
  it('opens the remote URL in the system browser', () => {
    const url = 'https://github.com/owner/repo/issues/42';

    HostService.openUrl(url);

    expect(Linking.openURL).toHaveBeenCalledWith(url);
  });

  it('ignores non-web URLs', () => {
    HostService.openUrl('javascript:alert(1)');

    expect(Linking.openURL).not.toHaveBeenCalledWith('javascript:alert(1)');
  });
});
