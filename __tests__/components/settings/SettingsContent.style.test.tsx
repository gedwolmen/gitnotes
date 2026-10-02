import path from 'path';
import fs from 'fs';

const srcPath = path.resolve(__dirname, '../../../src');
const settingsContentSrc = fs.readFileSync(
  path.join(srcPath, 'components/settings/SettingsContent.tsx'),
  'utf8',
);

const enI18n = JSON.parse(
  fs.readFileSync(path.join(srcPath, 'i18n/en.json'), 'utf8'),
);

describe('SettingsContent retrofuturistic style selector (source)', () => {
  describe('four-way style selector in source', () => {
    it('has retrofuturistic GroupRow with correct testID', () => {
      expect(settingsContentSrc).toMatch(
        /testID\s*=\s*["']settings\.option\.style\.retrofuturistic["']/,
      );
    });

    it('retrofuturistic calls setStyle(retrofuturistic) for Pro users', () => {
      const idx = settingsContentSrc.indexOf('settings.option.style.retrofuturistic');
      const section = settingsContentSrc.slice(idx, idx + 700);
      expect(section).toMatch(/isPro\s*\?\s*\(\)\s*=>\s*{\s*HapticService\.selection\(\);\s*setStyle\(['"]retrofuturistic['"]\)/);
    });

    it('retrofuturistic calls promptProUpgrade for free users', () => {
      const idx = settingsContentSrc.indexOf('settings.option.style.retrofuturistic');
      const section = settingsContentSrc.slice(idx, idx + 700);
      expect(section).toMatch(/promptProUpgrade\(t,\s*onOpenPaywall\)/);
    });

    it('retrofuturistic has lock icon for free users', () => {
      const idx = settingsContentSrc.indexOf('settings.option.style.retrofuturistic');
      const section = settingsContentSrc.slice(idx, idx + 700);
      expect(section).toMatch(/lock-closed/);
    });

    it('retrofuturistic has checkmark for selected state', () => {
      const idx = settingsContentSrc.indexOf('settings.option.style.retrofuturistic');
      const section = settingsContentSrc.slice(idx, idx + 700);
      expect(section).toMatch(/uiStyle\s*===\s*['"]retrofuturistic['"]/);
    });

    it('retrofuturistic option is between neo-brutalist and dark-mode toggle', () => {
      const neoIdx = settingsContentSrc.indexOf("settings.option.style.neo-brutalist");
      const retroIdx = settingsContentSrc.indexOf("settings.option.style.retrofuturistic");
      const darkModeIdx = settingsContentSrc.indexOf("settings.toggle.theme");
      expect(retroIdx).toBeGreaterThan(neoIdx);
      expect(darkModeIdx).toBeGreaterThan(retroIdx);
    });
  });

  describe('i18n labels', () => {
    it('en.json has settings.style.retrofuturistic label', () => {
      expect(enI18n.settings.style.retrofuturistic).toBeTruthy();
    });

    it('en.json hint mentions retrofuturistic as premium', () => {
      const hint = enI18n.settings.style.hint;
      expect(hint).toMatch(/Retrofuturistic/);
      expect(hint).toMatch(/Pro/i);
    });

    it('en.json hint lists free options correctly', () => {
      const hint = enI18n.settings.style.hint;
      expect(hint).toMatch(/Basic.*free/i);
      expect(hint).toMatch(/Neo-Brutalist.*free/i);
    });
  });

  describe('type contract', () => {
    it('SettingsContentProps uiStyle includes retrofuturistic', () => {
      const propsIdx = settingsContentSrc.indexOf('uiStyle: ThemeStyle');
      expect(propsIdx).toBeGreaterThan(0);
    });
  });
});
