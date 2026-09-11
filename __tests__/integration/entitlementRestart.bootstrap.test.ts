import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  bootstrapEntitlement,
  useProStore,
  PRO_ENTITLEMENT_ID,
  resetAll,
  getPurchasesMock,
  storeStateAtEnforceCall,
  mockEnforceTierLimits,
  mockSaveRepositories,
  mockAuthGetActiveSummary,
  getRebindCalls,
} from './entitlementTestHelpers';

describe('entitlement restart: bootstrap order + startup restore boundary', () => {
  beforeEach(() => { resetAll(); });
  afterEach(() => { jest.restoreAllMocks(); });

  describe('cold restart: Pro remains Pro, Free remains gated', () => {
    it('entitlementActive=true persists through bootstrapEntitlement without truncation', async () => {
      mockAuthGetActiveSummary.mockResolvedValueOnce({
        account: { id: 'acc1', name: 'Account 1', login: 'user1' },
        activeHostId: 'host1',
        hosts: [{ id: 'host1', provider: 'github', hostLogin: 'user1', hostUserId: '12345' }],
      });
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({
        entitlements: { active: { [PRO_ENTITLEMENT_ID]: { isActive: true, periodType: 'paid' } } },
      });

      await bootstrapEntitlement();

      expect(storeStateAtEnforceCall[0]?.entitlementActive).toBe(true);
      expect(mockSaveRepositories).not.toHaveBeenCalled();
      expect(useProStore.getState().status).toBe('pro');
    });

    it('entitlementActive=false results in free status after cold restart', async () => {
      mockAuthGetActiveSummary.mockResolvedValueOnce(null);
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({
        entitlements: { active: {} },
      });

      await bootstrapEntitlement();

      expect(storeStateAtEnforceCall[0]?.entitlementActive).toBe(false);
      expect(useProStore.getState().status).toBe('free');
    });

    it('bootstrapEntitlement runs rebind before enforce', async () => {
      mockAuthGetActiveSummary.mockResolvedValueOnce(null);
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({ entitlements: { active: {} } });

      await bootstrapEntitlement();

      expect(getRebindCalls().length).toBe(1);
      expect(mockEnforceTierLimits).toHaveBeenCalled();
    });
  });

  describe('restorePurchases is never called at startup', () => {
    it('bootstrapEntitlement does NOT call restorePurchases', async () => {
      mockAuthGetActiveSummary.mockResolvedValueOnce({
        account: { id: 'acc1', name: 'Account 1', login: 'user1' },
        activeHostId: 'host1',
        hosts: [{ id: 'host1', provider: 'github', hostLogin: 'user1', hostUserId: '12345' }],
      });
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({
        entitlements: { active: { [PRO_ENTITLEMENT_ID]: { isActive: true, periodType: 'paid' } } },
      });

      await bootstrapEntitlement();

      expect((Purchases.restorePurchases as jest.Mock)).not.toHaveBeenCalled();
    });

    it('proStore.initialize does NOT call restorePurchases', async () => {
      mockAuthGetActiveSummary.mockResolvedValueOnce(null);
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({ entitlements: { active: {} } });

      await useProStore.getState().initialize();

      expect((Purchases.restorePurchases as jest.Mock)).not.toHaveBeenCalled();
    });
  });
});
