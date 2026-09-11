import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  useProStore,
  PRO_ENTITLEMENT_ID,
  resetAll,
  getPurchasesMock,
  mockAuthGetActiveSummary,
} from './entitlementTestHelpers';

describe('entitlement restart: account switching cannot leak entitlements', () => {
  beforeEach(() => { resetAll(); });
  afterEach(() => { jest.restoreAllMocks(); });

  describe('switching from Pro account to Free account transitions to free', () => {
    it('bindAccount with Free entitlement updates state to free', async () => {
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);

      mockAuthGetActiveSummary.mockResolvedValueOnce({
        account: { id: 'acc1', name: 'Account 1', login: 'user1' },
        activeHostId: 'host1',
        hosts: [{ id: 'host1', provider: 'github', hostLogin: 'user1', hostUserId: '12345' }],
      });
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({
        entitlements: { active: { [PRO_ENTITLEMENT_ID]: { isActive: true, periodType: 'paid' } } },
      });
      (Purchases.logIn as jest.Mock).mockResolvedValueOnce({
        customerInfo: { entitlements: { active: { [PRO_ENTITLEMENT_ID]: { isActive: true } } } },
        created: false,
      });

      await useProStore.getState().initialize();
      expect(useProStore.getState().status).toBe('pro');

      (Purchases.getCustomerInfo as jest.Mock).mockReset();
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({ entitlements: { active: {} } });
      (Purchases.logIn as jest.Mock).mockReset();
      (Purchases.logIn as jest.Mock).mockResolvedValueOnce({
        customerInfo: { entitlements: { active: {} } },
        created: false,
      });

      await useProStore.getState().bindAccount('gitnotes:github:99999');

      expect(useProStore.getState().status).toBe('free');
      expect(useProStore.getState().entitlementActive).toBe(false);
    });

    it('unbindAccount resets entitlement to free', async () => {
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);

      mockAuthGetActiveSummary.mockResolvedValueOnce({
        account: { id: 'acc1', name: 'Account 1', login: 'user1' },
        activeHostId: 'host1',
        hosts: [{ id: 'host1', provider: 'github', hostLogin: 'user1', hostUserId: '12345' }],
      });
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({
        entitlements: { active: { [PRO_ENTITLEMENT_ID]: { isActive: true, periodType: 'paid' } } },
      });
      (Purchases.logIn as jest.Mock).mockResolvedValueOnce({
        customerInfo: { entitlements: { active: { [PRO_ENTITLEMENT_ID]: { isActive: true } } } },
        created: false,
      });

      await useProStore.getState().initialize();
      expect(useProStore.getState().status).toBe('pro');

      (Purchases.logOut as jest.Mock).mockResolvedValueOnce({ entitlements: { active: {} } });
      await useProStore.getState().unbindAccount();

      expect(useProStore.getState().status).toBe('free');
      expect(useProStore.getState().entitlementActive).toBe(false);
    });
  });
});
