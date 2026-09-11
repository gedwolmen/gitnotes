import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  useProStore,
  resetAll,
  getPurchasesMock,
  mockAuthGetActiveSummary,
} from './entitlementTestHelpers';

describe('entitlement restart: proStore.restore() is the only path to restorePurchases', () => {
  beforeEach(() => { resetAll(); });
  afterEach(() => { jest.restoreAllMocks(); });

  describe('restore() behavior', () => {
    it('restore() sets isRestoring=true and calls restorePurchases', async () => {
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.restorePurchases as jest.Mock).mockResolvedValueOnce({ entitlements: { active: {} } });
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({ entitlements: { active: {} } });

      mockAuthGetActiveSummary.mockResolvedValueOnce(null);
      await useProStore.getState().initialize();

      (Purchases.restorePurchases as jest.Mock).mockClear();
      (Purchases.getCustomerInfo as jest.Mock).mockClear();

      const restorePromise = useProStore.getState().restore();

      expect(useProStore.getState().isRestoring).toBe(true);
      const outcome = await restorePromise;

      expect((Purchases.restorePurchases as jest.Mock)).toHaveBeenCalledTimes(1);
      expect(outcome).toBe('nothing');
      expect(useProStore.getState().isRestoring).toBe(false);
    });

    it('restore() returns error when restorePurchases throws', async () => {
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.restorePurchases as jest.Mock).mockRejectedValueOnce(new Error('Restore failed'));
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({ entitlements: { active: {} } });

      mockAuthGetActiveSummary.mockResolvedValueOnce(null);
      await useProStore.getState().initialize();

      (Purchases.restorePurchases as jest.Mock).mockClear();
      const outcome = await useProStore.getState().restore();

      expect(outcome).toBe('error');
      expect(useProStore.getState().error).toMatch(/Restore failed/i);
      expect(useProStore.getState().isRestoring).toBe(false);
    });

    it('restore() on unconfigured store calls restorePurchases and returns error', async () => {
      const Purchases = getPurchasesMock();
      (Purchases.restorePurchases as jest.Mock).mockRejectedValueOnce(
        new Error('Purchases not configured'),
      );

      const outcome = await useProStore.getState().restore();

      expect(outcome).toBe('error');
      expect((Purchases.restorePurchases as jest.Mock)).toHaveBeenCalledTimes(1);
    });
  });
});
