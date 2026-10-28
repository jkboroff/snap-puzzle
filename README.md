# Snap Puzzle

A kids' jigsaw game made from your own photos. Take a picture, or pick one from the gallery, and it
becomes a 12, 20, 30 or 42 piece jigsaw with real hand-cut pieces. Drag the pieces onto the board
with your fingers; they click in when they're in the right spot.

- Works offline. Photos stay on the device, in the app's own storage (the last 12 are kept).
- No ads, accounts or tracking.
- Grown-up settings (gear icon): the child's name for the cheers ("You did it, Sam!"), and sound on/off.
- Sound (the voice and the click/fanfare effects) is off until a grown-up turns it on. The voice uses
  the phone's own text-to-speech engine.

**Play it:** https://jkboroff.github.io/snap-puzzle/ (on a phone, use "Add to Home Screen" to install it).

## Build the Android APK

Needs Node 22+, JDK 21 and the Android SDK (platform 36).

```bash
npm install
npm run android                     # web build + copy into android/
cd android && JAVA_HOME=/opt/jdk-21 ./gradlew assembleRelease --no-daemon
# -> android/app/build/outputs/apk/release/app-release.apk
```

Before each release, bump `versionCode` and `versionName` in `android/app/build.gradle`.

### Signing key

Release builds are signed with the key at `/root/.android/snap-puzzle/release.jks` on the build machine.
Its passwords are in `keystore.properties` next to it, and `android/keystore.properties` (gitignored)
links there. **Back that folder up.** Every update must be signed with the same key, or phones
that already have the app will refuse to install the update. Without `keystore.properties`, the
release build comes out unsigned.

### Icons and splash

The sources are in `assets/` (rendered from `public/icon.svg`). To regenerate the Android sizes:

```bash
npx @capacitor/assets generate --android --splashBackgroundColor '#6366f1' --splashBackgroundColorDark '#6366f1'
```

## Web version (GitHub Pages)

Every push to `main` builds the site, and `.github/workflows/pages.yml` publishes it to the
`gh-pages` branch, which GitHub Pages serves.
After the first visit, a service worker (`sw.template.js`, filled in at build time by
`vite.config.ts`) keeps every file cached, so the installed web app works offline.
`npm run dev` runs it locally. The camera button needs HTTPS (or localhost).
