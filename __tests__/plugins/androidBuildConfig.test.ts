import { readFileSync } from 'fs';
import { join } from 'path';

const APP_JSON_PATH = join(__dirname, '../../app.json');

function getAppJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(APP_JSON_PATH, 'utf-8'));
}

describe('Android build configuration invariants', () => {
  describe('expo-build-properties plugin', () => {
    test('expo-build-properties plugin is present in plugins array', () => {
      const appJson = getAppJson();
      const plugins: unknown[] = appJson.expo?.plugins ?? [];
      const hasBuildProperties = plugins.some(
        (p) => Array.isArray(p) && p[0] === 'expo-build-properties',
      );
      expect(hasBuildProperties).toBe(true);
    });

    test('enableMinifyInReleaseBuilds is true', () => {
      const appJson = getAppJson();
      const plugins: unknown[] = appJson.expo?.plugins ?? [];
      const buildProps = plugins.find(
        (p): p is [string, Record<string, unknown>] =>
          Array.isArray(p) && p[0] === 'expo-build-properties',
      );
      expect(buildProps).toBeDefined();
      expect(buildProps?.[1]?.android?.enableMinifyInReleaseBuilds).toBe(true);
    });

    test('enableShrinkResourcesInReleaseBuilds is true', () => {
      const appJson = getAppJson();
      const plugins: unknown[] = appJson.expo?.plugins ?? [];
      const buildProps = plugins.find(
        (p): p is [string, Record<string, unknown>] =>
          Array.isArray(p) && p[0] === 'expo-build-properties',
      );
      expect(buildProps).toBeDefined();
      expect(buildProps?.[1]?.android?.enableShrinkResourcesInReleaseBuilds).toBe(true);
    });

    test('JNA warning suppression rule is present', () => {
      const appJson = getAppJson();
      const plugins: unknown[] = appJson.expo?.plugins ?? [];
      const buildProps = plugins.find(
        (p): p is [string, Record<string, unknown>] =>
          Array.isArray(p) && p[0] === 'expo-build-properties',
      );
      const extraRules: string = buildProps?.[1]?.android?.extraProguardRules ?? '';
      expect(extraRules).toContain('java.awt.Component');
    });

    test('no deprecated enableProguardInReleaseBuilds key', () => {
      const appJson = getAppJson();
      const plugins: unknown[] = appJson.expo?.plugins ?? [];
      const buildProps = plugins.find(
        (p): p is [string, Record<string, unknown>] =>
          Array.isArray(p) && p[0] === 'expo-build-properties',
      );
      expect(buildProps?.[1]?.android).not.toHaveProperty('enableProguardInReleaseBuilds');
    });
  });

  describe('orientation configuration', () => {
    test('orientation is system-default (not portrait-locked)', () => {
      const appJson = getAppJson();
      expect(appJson.expo?.orientation).toBe('default');
    });
  });
});
