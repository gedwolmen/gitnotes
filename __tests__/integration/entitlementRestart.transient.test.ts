import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  bootstrapEntitlement,
  useProStore,
  PRO_ENTITLEMENT_ID,
  __setDelayForTests,
  resetAll,
  getPurchasesMock,
  mockAuthGetActiveSummary,
} from './entitlementTestHelpers';

describe('entitlement restart: transient failures with bounded retry', () => {
  beforeEach(() => { resetAll(); });
  afterEach(() => { jest.restoreAllMocks(); });

  describe('getCustomerInfo retries transient failures up to 3 times', () => {
    it('succeeds after two transient failures and a third success', async () => {
      mockAuthGetActiveSummary.mockResolvedValueOnce(null);
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock)
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValueOnce({
          entitlements: { active: {} },
          originalApplicationVersion: null,
          originalPurchaseDate: null,
        });

      __setDelayForTests(() => Promise.resolve());
      await bootstrapEntitlement();

      expect((Purchases.getCustomerInfo as jest.Mock)).toHaveBeenCalledTimes(3);
      expect(useProStore.getState().status).toBe('free');
    });

    it('throws after 3 failures with error stored in state', async () => {
      mockAuthGetActiveSummary.mockResolvedValueOnce(null);
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('network timeout'));

      __setDelayForTests(() => Promise.resolve());
      await bootstrapEntitlement();

      expect((Purchases.getCustomerInfo as jest.Mock)).toHaveBeenCalledTimes(3);
      expect(useProStore.getState().status).toBe('free');
      expect(useProStore.getState().error).not.toBeNull();
    });
  });

  describe('logInAppUser retries transient failures up to 3 times', () => {
    it('succeeds after two transient failures and a third success', async () => {
      mockAuthGetActiveSummary.mockResolvedValueOnce(null);
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({ entitlements: { active: {} } });
      await bootstrapEntitlement();

      (Purchases.logIn as jest.Mock).mockReset();
      (Purchases.logIn as jest.Mock)
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValueOnce({
          customerInfo: { entitlements: { active: { [PRO_ENTITLEMENT_ID]: { isActive: true } } } },
          created: false,
        });

      __setDelayForTests(() => Promise.resolve());
      await useProStore.getState().bindAccount('gitnotes:github:99999');

      expect((Purchases.logIn as jest.Mock)).toHaveBeenCalledTimes(3);
      expect(useProStore.getState().status).toBe('pro');
    });

    it('logs warning after 3 failures and does not update state', async () => {
      mockAuthGetActiveSummary.mockResolvedValueOnce(null);
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({ entitlements: { active: {} } });
      await bootstrapEntitlement();

      (Purchases.logIn as jest.Mock).mockReset();
      (Purchases.logIn as jest.Mock).mockRejectedValue(new Error('network timeout'));

      __setDelayForTests(() => Promise.resolve());
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { /* noop */ });
      await useProStore.getState().bindAccount('gitnotes:github:99999');

      expect((Purchases.logIn as jest.Mock)).toHaveBeenCalledTimes(3);
      expect(useProStore.getState().status).toBe('free');
      const warnCall = consoleWarnSpy.mock.calls.find(
        (call) => call[0] && String(call[0]).includes('logInAppUser failed after retries'),
      );
      expect(warnCall).toBeDefined();
      consoleWarnSpy.mockRestore(); /* noop */
    });
  });
});
