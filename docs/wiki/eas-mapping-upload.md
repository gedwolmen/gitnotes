# EAS Mapping File Auto-Upload Setup

This page documents how to configure EAS Build to automatically upload R8/ProGuard mapping files to Google Play Console, enabling readable crash/ANR stack traces in Play Console.

## Background

When building Android with `eas build --profile production`, R8 runs by default (Expo SDK 50+). R8 emits a `mapping.txt` artifact alongside the AAB. Google Play Console needs this file to deobfuscate crash traces.

Without the mapping file uploaded, crash traces show obfuscated names like `a.b.c.d` instead of readable class/method names.

## Setup

### Enable Auto-Upload in EAS Dashboard

1. Open your EAS project dashboard at https://expo.dev
2. Navigate to **Project Settings** → **Submit** → **Google Play Store**
3. Ensure the Play Store integration is linked (service account key configured)
4. Enable **"Auto-upload mapping files"** (label varies by dashboard version)
5. Verify the setting is saved

### Verify on Next Build

Run a production build and submit:

```bash
eas build --profile production --platform android
eas submit --profile production --platform android
```

Check the build in Google Play Console → **App Bundle Explorer** → version row. The deobfuscation warning should not appear.

## Manual Upload (Retroactive Fix)

If a version was uploaded without the mapping file:

1. Go to **EAS Build** → **Builds** → find the build for that version
2. Download `mapping.txt` from the **Artifacts** tab
3. Go to **Google Play Console** → **Release** → **App Bundle Explorer**
4. Find the version row → **Upload re-symbolication file**
5. Upload the `mapping.txt`

## Troubleshooting

### Warning Still Appears After Auto-Upload Enabled

- Check EAS build logs for upload errors
- Verify the service account has Play Console permissions
- Check if submission was performed via `eas submit` or manual Play Console upload

### Mapping File Not in Build Artifacts

- Ensure the build completed successfully (R8 must run)
- Check if `android.buildType` is set to `app-bundle` (not `apk`)
- Verify `production` profile uses `buildType: "app-bundle"`

## References

- [Expo EAS Build Configuration](https://docs.expo.dev/build/eas-json/)
- [Google Play Mapping Upload](https://support.google.com/googleplay/android-developer/answer/9859154)
- [Expo Android Builds](https://docs.expo.dev/build-reference/android-builds/)
