import { removeAppearanceLight } from '../../plugins/withSplashScreenDarkMode';

describe('removeAppearanceLight', () => {
  describe('should remove appearance="light" from device element', () => {
    test('removes appearance="light" from retina6_12 device', () => {
      const input = `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0">
    <device id="retina6_12" orientation="portrait" appearance="light"/>
    <resources/>
</document>`;
      const result = removeAppearanceLight(input);
      expect(result).not.toContain('appearance="light"');
      expect(result).not.toContain("appearance='light'");
      // Other device attributes must be preserved
      expect(result).toContain('id="retina6_12"');
      expect(result).toContain('orientation="portrait"');
    });

    test('removes appearance="light" with double quotes', () => {
      const input = `<device id="retina6_12" orientation="portrait" appearance="light"/>`;
      const result = removeAppearanceLight(input);
      expect(result).toBe('<device id="retina6_12" orientation="portrait"/>');
    });

    test('removes appearance=\'light\' with single quotes', () => {
      const input = `<device id="retina6_12" orientation="portrait" appearance='light'/>`;
      const result = removeAppearanceLight(input);
      expect(result).toBe('<device id="retina6_12" orientation="portrait"/>');
    });
  });

  describe('should preserve unrelated XML structure', () => {
    test('preserves other appearance values (e.g., dark) when light also present', () => {
      // When both appearance="light" and appearance="dark" exist in the same document,
      // only appearance="light" should be removed
      const input = `<document><device id="retina6_12" appearance="light"/><device id="another" appearance="dark"/></document>`;
      const result = removeAppearanceLight(input);
      expect(result).not.toContain('appearance="light"');
      expect(result).toContain('appearance="dark"');
    });

    test('preserves other attributes on device when removing appearance="light"', () => {
      const input = `<device id="retina6_12" orientation="portrait" appearance="light" other="value"/>`;
      const result = removeAppearanceLight(input);
      expect(result).toContain('id="retina6_12"');
      expect(result).toContain('orientation="portrait"');
      expect(result).toContain('other="value"');
      expect(result).not.toContain('appearance="light"');
    });

    test('preserves namedColor and backgroundColor references', () => {
      const input = `<?xml version="1.0"?>
<document>
    <device id="retina6_12" orientation="portrait" appearance="light"/>
    <color key="backgroundColor" name="SplashScreenBackground"/>
</document>`;
      const result = removeAppearanceLight(input);
      expect(result).toContain('name="SplashScreenBackground"');
      expect(result).toContain('backgroundColor');
    });

    test('preserves full storyboard structure with all scenes', () => {
      const input = `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="32700.99.1234" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="EXPO-VIEWCONTROLLER-1">
    <device id="retina6_12" orientation="portrait" appearance="light"/>
    <scenes>
        <scene sceneID="EXPO-SCENE-1"/>
    </scenes>
    <resources>
        <namedColor name="SplashScreenBackground"/>
    </resources>
</document>`;
      const result = removeAppearanceLight(input);
      expect(result).not.toContain('appearance="light"');
      expect(result).toContain('initialViewController="EXPO-VIEWCONTROLLER-1"');
      expect(result).toContain('namedColor name="SplashScreenBackground"');
      expect(result).toContain('<scenes>');
    });
  });

  describe('should reject invalid inputs', () => {
    test('throws when input is not a string', () => {
      // @ts-expect-error - intentionally passing wrong type to test runtime guard
      expect(() => removeAppearanceLight(null)).toThrow('xmlString must be a string');
      // @ts-expect-error - undefined is not a string and must be rejected
      expect(() => removeAppearanceLight(undefined)).toThrow('xmlString must be a string');
      // @ts-expect-error - number is not a string and must be rejected
      expect(() => removeAppearanceLight(123)).toThrow('xmlString must be a string');
    });

    test('throws when no appearance="light" marker is present', () => {
      const input = `<device id="retina6_12" orientation="portrait"/>`;
      expect(() => removeAppearanceLight(input)).toThrow(
        'No appearance="light" marker found'
      );
    });

    test('throws when XML is already cleaned (second call)', () => {
      const input = `<device id="retina6_12" orientation="portrait" appearance="light"/>`;
      // First call removes it
      removeAppearanceLight(input);
      // Second call on same string has no marker (string was not mutated)
      // But since we're passing the same string, it will find it again
      // So test with an already-clean string
      const cleanInput = `<device id="retina6_12" orientation="portrait"/>`;
      expect(() => removeAppearanceLight(cleanInput)).toThrow(
        'No appearance="light" marker found'
      );
    });
  });
});
