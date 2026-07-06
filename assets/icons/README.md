
═══════════════════════════════════════════════════════════════
  GENERATION INFO
═══════════════════════════════════════════════════════════════

Generated assets for ios, android, web (icon, splash, adaptive, favicon)

───────────────────────────────────────────────────────────────
  CONFIGURATION
───────────────────────────────────────────────────────────────

App name:    GitNotes
Platforms:   ios, android, web
Asset types: icon, splash, adaptive, favicon
Icon scale:  100%
Splash scale: 80%

Background:
  Type:  Solid color
  Color: #FFFFFF

Foreground:
  Type: SVG
  Path: ./assets/icon.svg

───────────────────────────────────────────────────────────────
  INTEGRATION STEPS
───────────────────────────────────────────────────────────────

  1. Copy app icon
     Copy the main icon to your Expo assets directory
     $ cp /Users/vidwadeseram/Documents/GitHub/gitnotes/gitnotes/assets/icons/ios/icon-1024.png ../expo/assets/images/icon.png

  2. Copy Android adaptive icon
     Copy the adaptive icon foreground for Android
     $ cp /Users/vidwadeseram/Documents/GitHub/gitnotes/gitnotes/assets/icons/android/mipmap-xxxhdpi/ic_launcher_foreground.png ../expo/assets/images/adaptive-icon.png

  3. Copy splash screen
     Copy a splash screen image (choose appropriate size for your needs)
     $ cp /Users/vidwadeseram/Documents/GitHub/gitnotes/gitnotes/assets/icons/ios/splash-1170x2532.png ../expo/assets/images/splash.png

  4. Copy web favicon
     Copy favicon.ico to public root and PNG favicons for web builds
     $ cp /Users/vidwadeseram/Documents/GitHub/gitnotes/gitnotes/assets/icons/web/favicon.ico ../public/ && cp /Users/vidwadeseram/Documents/GitHub/gitnotes/gitnotes/assets/icons/web/favicon-*.png ../public/

  5. Configure iOS 18 icon variants (Xcode)
     Copy ios/dark/, ios/tinted/, ios/clear-light/, ios/clear-dark/ folders to your Xcode asset catalog for iOS 18+ icon appearances

  6. Configure Android 13+ monochrome icons
     Add monochrome layer to your adaptive-icon XML for Material You themed icons

  7. Copy web manifest and PWA icons
     Copy site.webmanifest and PWA icons (including maskable) to your web public folder

  8. Use auto-generated iOS Contents.json
     Copy ios/AppIcon.appiconset/Contents.json to your Xcode asset catalog for automatic icon configuration

  9. Use auto-generated Android adaptive icon XML
     Copy android/mipmap-anydpi-v26/*.xml to your Android res folder for adaptive icon configuration

  10. Rebuild native projects
     Regenerate native iOS/Android projects with new assets
     $ cd ../expo && npx expo prebuild --clean

───────────────────────────────────────────────────────────────
  EXPO CONFIG EXAMPLE
───────────────────────────────────────────────────────────────

// app.config.ts asset configuration example:

// iOS icon (in expo.ios)
icon: './assets/images/icon.png',

// Android adaptive icon (in expo.android)
adaptiveIcon: {
  foregroundImage: './assets/images/adaptive-icon.png',
  monochromeImage: './assets/images/adaptive-icon-monochrome.png', // Android 13+ themed icons
  backgroundColor: '#FFFFFF', // or your background color
},

// Splash screen (in expo.plugins)
[
  'expo-splash-screen',
  {
    backgroundColor: '#FFFFFF',
    image: './assets/images/splash.png',
    imageWidth: 200,
  },
],

// Web favicon (in expo.web)
favicon: './assets/images/favicon.png',

// ─── Modern Favicon Setup (HTML head) ────────────────────────
// Place favicon.ico in your public root (browsers check /favicon.ico automatically)
//
// <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
// <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
// <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180x180.png">
// <link rel="manifest" href="/site.webmanifest">


// ─── iOS 18 Icon Variants (Xcode Asset Catalog) ───────────────
// For native iOS projects, configure AppIcon.appiconset/Contents.json:
//
// Add appearances for dark, tinted, and clear variants:
// {
//   "images": [
//     { "filename": "icon-60@2x.png", "idiom": "iphone", "scale": "2x", "size": "60x60" },
//     { "appearances": [{ "appearance": "luminosity", "value": "dark" }],
//       "filename": "dark/icon-60@2x.png", "idiom": "iphone", "scale": "2x", "size": "60x60" },
//     { "appearances": [{ "appearance": "luminosity", "value": "tinted" }],
//       "filename": "tinted/icon-60@2x.png", "idiom": "iphone", "scale": "2x", "size": "60x60" }
//   ]
// }


// ─── Android 13+ Themed Icons (Native) ────────────────────────
// For native Android projects, update res/mipmap-anydpi-v26/ic_launcher.xml:
//
// <adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
//   <background android:drawable="@mipmap/ic_launcher_background"/>
//   <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
//   <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
// </adaptive-icon>


───────────────────────────────────────────────────────────────
  NOTES
───────────────────────────────────────────────────────────────

  • The 1024x1024 icon is used as source; Expo generates all required sizes
  • For production, ensure icon has no transparency (iOS requirement)
  • Android adaptive icons should have content within the safe zone (66% center)
  • iOS 18+ supports 5 icon appearances: default, dark, tinted, clear-light, clear-dark
  • Tinted icons use white foreground; system applies wallpaper tint color
  • Clear icons have semi-transparent backgrounds for light/dark modes
  • Android 13+ themed icons require a monochrome layer in adaptive-icon XML
  • ic_launcher.xml and ic_launcher_round.xml are auto-generated with monochrome layer

═══════════════════════════════════════════════════════════════