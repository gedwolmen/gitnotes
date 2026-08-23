/**
 * Config plugin: make the grandfathered-Pro flag survive an Android
 * reinstall by enabling Android Auto Backup for the AsyncStorage DB.
 *
 * The grandfather decision is persisted in AsyncStorage
 * (`@gitnotes:pro_grandfathered`), which on Android lives in a SQLite
 * database named `RKStorage`. Two things previously made that flag
 * vanish on uninstall+reinstall:
 *
 *   1. `android:allowBackup` was `false` in app.json, disabling Auto
 *      Backup entirely.
 *   2. The expo-secure-store backup rules only include the
 *      `sharedpref` domain — the `database` domain (where RKStorage
 *      lives) was not backed up at all.
 *
 * This plugin:
 *   - sets `android:allowBackup="true"`,
 *   - points `android:fullBackupContent` / `android:dataExtractionRules`
 *     at our own rules XML that includes `database/RKStorage` +
 *     `sharedpref`, while still excluding the `SecureStore` sharedpref
 *     file (the GitHub token must stay device-only), and
 *   - writes those two rules files into
 *     `android/app/src/main/res/xml/` at prebuild time.
 *
 * Restoring the AsyncStorage DB restores the grandfather flag (and
 * other app prefs), so a grandfathered Android user keeps Pro across a
 * reinstall on the same Google account/device.
 */
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FULL_BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <include domain="database" path="RKStorage"/>
  <include domain="sharedpref" path="."/>
  <exclude domain="sharedpref" path="SecureStore"/>
</full-backup-content>
`;

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <include domain="database" path="RKStorage"/>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
  </cloud-backup>
  <device-transfer>
    <include domain="database" path="RKStorage"/>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withGrandfatherBackup(config) {
  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (!app) return c;
    app.$['android:allowBackup'] = 'true';
    app.$['android:fullBackupContent'] = '@xml/grandfather_backup_rules';
    app.$['android:dataExtractionRules'] = '@xml/grandfather_data_extraction_rules';
    return c;
  });

  return withDangerousMod(config, [
    'android',
    async (c) => {
      const resXml = path.join(
        c.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(resXml, { recursive: true });
      fs.writeFileSync(path.join(resXml, 'grandfather_backup_rules.xml'), FULL_BACKUP_RULES);
      fs.writeFileSync(
        path.join(resXml, 'grandfather_data_extraction_rules.xml'),
        DATA_EXTRACTION_RULES,
      );
      return c;
    },
  ]);
};
