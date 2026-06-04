# Capacitor mobile wrapper plan

## Goal

Create a separate mobile wrapper for Tekstura амеры so the app shell can start offline on iOS and Android even after the app has been fully closed.

The mobile wrapper must not be a remote-only WebView. The core app shell must be bundled inside the mobile app.

## Why this is needed

The current PWA works after the app shell is loaded and cached, but iOS can fail to start a standalone PWA in airplane mode before the service worker gets control.

A native wrapper avoids that cold-start limitation by shipping the web files inside the installed app.

## Recommended approach

Use Capacitor in a separate project or separate repository:

tekstura-zamery-mobile

The existing production web app must remain stable. Do not move iOS or Android generated projects into the main web PR until the approach is tested.

## Required bundled app shell files

- index.html
- app.js
- offline-db.js
- styles.css
- drawing-bridge.js
- details-enhance.js
- manifest.webmanifest
- icons and PWA assets

## Important rule

Do not set Capacitor server.url for production offline mode.

If server.url points to https://tekstura-zamery.vercel.app/, the app becomes a remote wrapper and will again depend on the network at startup.

## Expected startup flow

1. Mobile app opens local bundled index.html.
2. App shell appears without internet.
3. Local remembered auth and offline mode are loaded.
4. TEMP drafts and offline photos are available.
5. Supabase connects only when internet is available.
6. Sync runs after connectivity is restored.

## First implementation scope

- create a separate mobile project;
- copy the current web shell into a local www or dist folder;
- verify offline start;
- verify local drafts;
- verify camera/photo permissions;
- verify Supabase sync after reconnect.

Do not refactor the main web application as part of this step.

## Risks to check

- IndexedDB behavior inside Capacitor WebView;
- camera and photo picker permissions;
- file/blob handling for offline photos;
- signed URL rendering after sync;
- iOS storage persistence;
- Android storage persistence;
- differences between Safari PWA and Capacitor WebView.

## Build targets

1. iOS local test build.
2. Android local debug APK.
3. Android release APK/AAB only after testing.
4. iOS TestFlight only after testing.
