import {
  DeviceProfileSchema,
  RouteSchema,
  ImageFormatSchema,
  OrientationSchema,
  StoreTypeSchema,
  validateDeviceProfile,
  validateRoute,
  validateOutputPath,
  buildMarketingConfig,
  getDimensions,
  getSafeArea,
  buildStoreFilename,
  DEVICE_DIMENSIONS,
  SAFE_AREAS,
  DEFAULT_CONFIG,
  SLIDE_COPY,
} from '../../scripts/marketing/config';

describe('marketing/config - DeviceProfileSchema', () => {
  test('accepts valid device profiles', () => {
    const valid = ['iphone-6.9-inch', 'ipad-13-inch', 'android-phone', 'android-7-inch-tablet', 'android-10-inch-tablet'] as const;
    valid.forEach((profile) => {
      expect(DeviceProfileSchema.safeParse(profile).success).toBe(true);
    });
  });

  test('rejects unknown device profiles', () => {
    const invalid = ['iphone-7-inch', 'android-tablet', 'desktop', '', 'IPHONE-6.9-INCH'];
    invalid.forEach((profile) => {
      expect(DeviceProfileSchema.safeParse(profile).success).toBe(false);
    });
  });
});

describe('marketing/config - RouteSchema', () => {
  test('accepts valid routes', () => {
    const valid = ['home', 'notes', 'note-editor', 'canvas-editor', 'todos', 'explore', 'chat', 'chat-thread', 'settings', 'graph-view'] as const;
    valid.forEach((route) => {
      expect(RouteSchema.safeParse(route).success).toBe(true);
    });
  });

  test('rejects unknown routes', () => {
    const invalid = ['dashboard', 'profile', 'NOTE-EDITOR', '', 'home '];
    invalid.forEach((route) => {
      expect(RouteSchema.safeParse(route).success).toBe(false);
    });
  });
});

describe('marketing/config - ImageFormatSchema', () => {
  test('accepts valid formats', () => {
    expect(ImageFormatSchema.safeParse('png').success).toBe(true);
    expect(ImageFormatSchema.safeParse('jpeg').success).toBe(true);
  });

  test('rejects invalid formats', () => {
    expect(ImageFormatSchema.safeParse('jpg').success).toBe(false);
    expect(ImageFormatSchema.safeParse('webp').success).toBe(false);
    expect(ImageFormatSchema.safeParse('PNG').success).toBe(false);
  });
});

describe('marketing/config - OrientationSchema', () => {
  test('accepts valid orientations', () => {
    expect(OrientationSchema.safeParse('portrait').success).toBe(true);
    expect(OrientationSchema.safeParse('landscape').success).toBe(true);
  });

  test('rejects invalid orientations', () => {
    expect(OrientationSchema.safeParse('PORTRAIT').success).toBe(false);
    expect(OrientationSchema.safeParse('square').success).toBe(false);
  });
});

describe('marketing/config - StoreTypeSchema', () => {
  test('accepts valid store types', () => {
    expect(StoreTypeSchema.safeParse('apple-app-store').success).toBe(true);
    expect(StoreTypeSchema.safeParse('google-play').success).toBe(true);
  });

  test('rejects invalid store types', () => {
    expect(StoreTypeSchema.safeParse('app-store').success).toBe(false);
    expect(StoreTypeSchema.safeParse('googleplay').success).toBe(false);
  });
});

describe('marketing/config - validateDeviceProfile', () => {
  test('returns true for valid profiles', () => {
    expect(validateDeviceProfile('iphone-6.9-inch')).toBe(true);
    expect(validateDeviceProfile('android-phone')).toBe(true);
  });

  test('returns false for invalid profiles', () => {
    expect(validateDeviceProfile('unknown-device')).toBe(false);
    expect(validateDeviceProfile('')).toBe(false);
  });
});

describe('marketing/config - validateRoute', () => {
  test('returns true for valid routes', () => {
    expect(validateRoute('home')).toBe(true);
    expect(validateRoute('note-editor')).toBe(true);
  });

  test('returns false for invalid routes', () => {
    expect(validateRoute('dashboard')).toBe(false);
    expect(validateRoute('')).toBe(false);
  });
});

describe('marketing/config - validateOutputPath', () => {
  test('accepts valid relative paths within assets/marketing/', () => {
    expect(validateOutputPath('assets/marketing/store/apple.png')).toBe(true);
    expect(validateOutputPath('assets/marketing/runs/run-1/manifest.json')).toBe(true);
    expect(validateOutputPath('assets/marketing/')).toBe(true);
  });

  test('rejects absolute paths', () => {
    expect(validateOutputPath('/tmp/marketing/output.png')).toBe(false);
    expect(validateOutputPath('/Users/name/assets/marketing/output.png')).toBe(false);
  });

  test('rejects path traversal', () => {
    expect(validateOutputPath('assets/marketing/../outside.png')).toBe(false);
    expect(validateOutputPath('assets/marketing/../../secrets.json')).toBe(false);
    expect(validateOutputPath('assets/marketing/runs/../../../etc/passwd')).toBe(false);
  });

  test('rejects paths outside assets/marketing/', () => {
    expect(validateOutputPath('output.png')).toBe(false);
    expect(validateOutputPath('store/output.png')).toBe(false);
    expect(validateOutputPath('assets/logo.png')).toBe(false);
  });
});

describe('marketing/config - getDimensions', () => {
  test('returns correct dimensions for iPhone 6.9-inch', () => {
    const portrait = getDimensions('iphone-6.9-inch', 'portrait');
    expect(portrait).toEqual({ width: 1290, height: 2796 });

    const landscape = getDimensions('iphone-6.9-inch', 'landscape');
    expect(landscape).toEqual({ width: 2796, height: 1290 });
  });

  test('returns correct dimensions for iPad 13-inch', () => {
    const portrait = getDimensions('ipad-13-inch', 'portrait');
    expect(portrait).toEqual({ width: 2048, height: 2732 });

    const landscape = getDimensions('ipad-13-inch', 'landscape');
    expect(landscape).toEqual({ width: 2732, height: 2048 });
  });

  test('returns correct dimensions for Android phone', () => {
    const portrait = getDimensions('android-phone', 'portrait');
    expect(portrait).toEqual({ width: 1080, height: 2340 });
  });

  test('returns correct dimensions for Android tablets', () => {
    const sevenInch = getDimensions('android-7-inch-tablet', 'portrait');
    expect(sevenInch).toEqual({ width: 1080, height: 1920 });

    const tenInch = getDimensions('android-10-inch-tablet', 'portrait');
    expect(tenInch).toEqual({ width: 1600, height: 2560 });
  });
});

describe('marketing/config - getSafeArea', () => {
  test('returns safe area for iPhone 6.9-inch', () => {
    const safe = getSafeArea('iphone-6.9-inch');
    expect(safe).toEqual({ top: 63, bottom: 51, left: 0, right: 0 });
  });

  test('returns zero safe area for other devices', () => {
    const devices: DeviceProfile[] = ['ipad-13-inch', 'android-phone', 'android-7-inch-tablet', 'android-10-inch-tablet'];
    devices.forEach((device) => {
      const safe = getSafeArea(device);
      expect(safe).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    });
  });
});

describe('marketing/config - buildMarketingConfig', () => {
  test('builds valid config with required fields only', () => {
    const config = buildMarketingConfig({
      device: 'iphone-6.9-inch',
      route: 'home',
      orientation: 'portrait',
    });

    expect(config.device).toBe('iphone-6.9-inch');
    expect(config.route).toBe('home');
    expect(config.orientation).toBe('portrait');
    expect(config.format).toBe(DEFAULT_CONFIG.format);
    expect(config.store).toBe(DEFAULT_CONFIG.store);
    expect(config.locale).toBe('en');
    expect(config.outputDir).toBe(DEFAULT_CONFIG.outputDir);
    expect(config.overwrite).toBe(DEFAULT_CONFIG.overwrite);
  });

  test('builds valid config with all fields', () => {
    const config = buildMarketingConfig({
      device: 'ipad-13-inch',
      route: 'note-editor',
      orientation: 'landscape',
      format: 'jpeg',
      store: 'google-play',
      locale: 'en',
      outputDir: 'assets/marketing/store/google-play',
      overwrite: true,
    });

    expect(config.device).toBe('ipad-13-inch');
    expect(config.route).toBe('note-editor');
    expect(config.orientation).toBe('landscape');
    expect(config.format).toBe('jpeg');
    expect(config.store).toBe('google-play');
    expect(config.overwrite).toBe(true);
  });

  test('throws on unknown device profile', () => {
    expect(() =>
      buildMarketingConfig({
        device: 'unknown-device',
        route: 'home',
        orientation: 'portrait',
      })
    ).toThrow();
  });

  test('throws on unknown route', () => {
    expect(() =>
      buildMarketingConfig({
        device: 'iphone-6.9-inch',
        route: 'dashboard',
        orientation: 'portrait',
      })
    ).toThrow();
  });

  test('throws on malformed orientation', () => {
    expect(() =>
      buildMarketingConfig({
        device: 'iphone-6.9-inch',
        route: 'home',
        orientation: 'diagonal',
      })
    ).toThrow();
  });

  test('throws when output path escapes assets/marketing/', () => {
    expect(() =>
      buildMarketingConfig({
        device: 'iphone-6.9-inch',
        route: 'home',
        orientation: 'portrait',
        outputDir: '/tmp/output',
      })
    ).toThrow();

    expect(() =>
      buildMarketingConfig({
        device: 'iphone-6.9-inch',
        route: 'home',
        orientation: 'portrait',
        outputDir: 'assets/marketing/../../../etc/passwd',
      })
    ).toThrow();
  });
});

describe('marketing/config - buildStoreFilename', () => {
  test('builds correct filename for portrait PNG', () => {
    const filename = buildStoreFilename('iphone-6.9-inch', 'home', 'portrait', 'png', 1);
    expect(filename).toBe('iphone-6.9-inch-home-portrait-01.png');
  });

  test('builds correct filename for landscape JPEG', () => {
    const filename = buildStoreFilename('ipad-13-inch', 'explore', 'landscape', 'jpeg', 3);
    expect(filename).toBe('ipad-13-inch-explore-landscape-03.jpg');
  });

  test('pads index to two digits', () => {
    const filename1 = buildStoreFilename('android-phone', 'notes', 'portrait', 'png', 1);
    const filename10 = buildStoreFilename('android-phone', 'notes', 'portrait', 'png', 10);
    expect(filename1).toBe('android-phone-notes-portrait-01.png');
    expect(filename10).toBe('android-phone-notes-portrait-10.png');
  });
});

describe('marketing/config - DEVICE_DIMENSIONS', () => {
  test('all device profiles have both orientations', () => {
    const profiles: DeviceProfile[] = ['iphone-6.9-inch', 'ipad-13-inch', 'android-phone', 'android-7-inch-tablet', 'android-10-inch-tablet'];
    const orientations: ('portrait' | 'landscape')[] = ['portrait', 'landscape'];

    profiles.forEach((profile) => {
      orientations.forEach((orientation) => {
        expect(DEVICE_DIMENSIONS[profile][orientation]).toBeDefined();
        expect(DEVICE_DIMENSIONS[profile][orientation].width).toBeGreaterThan(0);
        expect(DEVICE_DIMENSIONS[profile][orientation].height).toBeGreaterThan(0);
      });
    });
  });
});

describe('marketing/config - SAFE_AREAS', () => {
  test('all device profiles have safe area definitions', () => {
    const profiles: DeviceProfile[] = ['iphone-6.9-inch', 'ipad-13-inch', 'android-phone', 'android-7-inch-tablet', 'android-10-inch-tablet'];

    profiles.forEach((profile) => {
      const safe = SAFE_AREAS[profile];
      expect(safe).toBeDefined();
      expect(typeof safe.top).toBe('number');
      expect(typeof safe.bottom).toBe('number');
      expect(typeof safe.left).toBe('number');
      expect(typeof safe.right).toBe('number');
    });
  });
});

describe('marketing/config - SLIDE_COPY', () => {
  test('has required slide keys', () => {
    const required = ['hero', 'notes', 'sync', 'ai', 'multiplatform'];
    required.forEach((key) => {
      expect(SLIDE_COPY[key]).toBeDefined();
      expect(typeof SLIDE_COPY[key].title).toBe('string');
    });
  });

  test('slide copy has non-empty titles', () => {
    Object.entries(SLIDE_COPY).forEach(([_key, copy]) => {
      expect(copy.title.length).toBeGreaterThan(0);
    });
  });
});

describe('marketing/config - DEFAULT_CONFIG', () => {
  test('has sensible defaults', () => {
    expect(DEFAULT_CONFIG.format).toBe('png');
    expect(DEFAULT_CONFIG.store).toBe('apple-app-store');
    expect(DEFAULT_CONFIG.locale).toBe('en');
    expect(DEFAULT_CONFIG.outputDir).toBe('assets/marketing/store');
    expect(DEFAULT_CONFIG.overwrite).toBe(false);
  });
});

type DeviceProfile = 'iphone-6.9-inch' | 'ipad-13-inch' | 'android-phone' | 'android-7-inch-tablet' | 'android-10-inch-tablet';
