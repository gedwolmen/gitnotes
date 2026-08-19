import Purchases from 'react-native-purchases';

describe('react-native-purchases jest mock', () => {
  it('exposes the SDK surface used by RevenueCatService', () => {
    expect(typeof Purchases.setLogLevel).toBe('function');
    expect(typeof Purchases.configure).toBe('function');
    expect(typeof Purchases.getOfferings).toBe('function');
    expect(typeof Purchases.purchasePackage).toBe('function');
    expect(typeof Purchases.restorePurchases).toBe('function');
    expect(typeof Purchases.getCustomerInfo).toBe('function');
    expect(typeof Purchases.addCustomerInfoUpdateListener).toBe('function');
    expect(typeof Purchases.checkTrialOrIntroductoryPriceEligibility).toBe('function');
    expect(Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE).toBe(2);
    expect(Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR).toBe('1');
  });

  it('getCustomerInfo resolves an empty active entitlement map by default', async () => {
    const info = await Purchases.getCustomerInfo();
    expect(info.entitlements.active).toEqual({});
  });
});
