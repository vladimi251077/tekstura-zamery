# Mobile wrapper checklist

## Repository safety

- [ ] Do not change production app logic in the planning PR.
- [ ] Do not change Supabase schema.
- [ ] Do not change RLS policies.
- [ ] Do not add generated iOS/Android folders to the planning PR.
- [ ] Keep the planning PR documentation-only.

## Project structure

Recommended separate project: tekstura-zamery-mobile

Recommended app metadata:

- App name: Tekstura амеры
- App ID: ru.tekstura.zamery

## Capacitor setup checklist

- [ ] Install Node.js.
- [ ] Install Capacitor CLI.
- [ ] Create mobile wrapper project.
- [ ] Configure capacitor.config.
- [ ] Set webDir to local bundled web files.
- [ ] Do not use remote-only server.url for offline production.
- [ ] Add iOS platform.
- [ ] Add Android platform.

## Bundled web shell checklist

- [ ] index.html
- [ ] app.js
- [ ] offline-db.js
- [ ] styles.css
- [ ] drawing-bridge.js
- [ ] details-enhance.js
- [ ] manifest.webmanifest
- [ ] icons and app assets
- [ ] any required helper JS files
- [ ] any required static assets from service worker app shell

## Offline startup checklist

- [ ] Open app online once.
- [ ] Close app completely.
- [ ] Enable airplane mode.
- [ ] Open app again.
- [ ] App shell opens without internet.
- [ ] User is not forced to login because Supabase is unavailable.
- [ ] Offline notice is shown.
- [ ] Local TEMP drafts are available.
- [ ] New TEMP draft can be created.

## Photo checklist

- [ ] Camera permission works on iOS.
- [ ] Camera permission works on Android.
- [ ] Gallery/file picker works.
- [ ] Offline photo blob is saved locally.
- [ ] Offline photo remains after app restart.
- [ ] Photo sync works after reconnect.
- [ ] Uploaded photo appears in Supabase Storage bucket measurement-photos.
- [ ] Photo row appears in measurement_photos.

## Sync checklist

- [ ] TEMP draft sync works after reconnect.
- [ ] Synced measurement status is отовый замер.
- [ ] Repeated sync does not duplicate measurements.
- [ ] Failed photo upload can be retried.
- [ ] Network errors do not delete local TEMP data.

## Auth checklist

- [ ] Remembered auth is loaded locally.
- [ ] App does not show login only because Supabase is temporarily unavailable.
- [ ] Logout clears local auth intentionally.
- [ ] Profile refresh works online.
- [ ] Role UI remains correct.

## Release checklist

- [ ] Android debug APK tested manually.
- [ ] Android release signing key created only after approval.
- [ ] Android AAB prepared only after testing.
- [ ] iOS build tested in Xcode.
- [ ] TestFlight considered only after offline flow is stable.
- [ ] Store deployment is not part of the first planning PR.
