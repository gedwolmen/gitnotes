describe('DEV_FORCE_PRO simulator override', () => {
  const originalOverride = process.env.EXPO_PUBLIC_FORCE_ENABLE_PRO_ON_SIMULATOR;

  afterEach(() => {
    if (originalOverride === undefined) {
      delete process.env.EXPO_PUBLIC_FORCE_ENABLE_PRO_ON_SIMULATOR;
    } else {
      process.env.EXPO_PUBLIC_FORCE_ENABLE_PRO_ON_SIMULATOR = originalOverride;
    }
    jest.resetModules();
    jest.unmock('expo-device');
  });

  it('disables the simulator Pro override when the public env var is false', () => {
    process.env.EXPO_PUBLIC_FORCE_ENABLE_PRO_ON_SIMULATOR = 'false';
    jest.doMock('expo-device', () => ({ isDevice: false }));

    let devForcePro: boolean | undefined;
    jest.isolateModules(() => {
      devForcePro = jest.requireActual('@/stores/proStore').DEV_FORCE_PRO;
    });

    expect(devForcePro).toBe(false);
  });
});
