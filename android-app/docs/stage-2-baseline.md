# Stage 2 Baseline

Recorded on 2026-09-21.

## Shared application shell

- Persistent media container remains mounted below the UI overlay.
- The collapsed side rail expands as an overlay and does not resize the main area.
- Selecting a menu route collapses the menu and focuses the first primary content item.
- Back from the expanded menu restores the last focused content item.
- Home, Live TV, VOD, Guide, Favorites, Search and Settings placeholders are available.
- A shared startup screen displays the purple TV icon, appTV branding and `Loading...`.

## Google TV

- Device: physical Chromecast with Google TV (`sabrina_prod_stable`), 1920x1080.
- Release APK installed and launched without Metro.
- Measured cold activity launch: 2,927 ms (`am start -W`).
- Startup loading screen verified visually on the physical device.
- D-pad navigation from content to the side menu verified.
- Selecting Live TV updated the page, collapsed the menu and moved focus to the
  first primary content item.

## Fire TV / Vega OS

- Device: physical Fire TV (`calypso`), Vega OS 1.2, armv7l.
- Debug VPKGs built successfully for aarch64, armv7 and x86_64.
- Final armv7 VPKG size: approximately 2.11 MB.
- Final armv7 VPKG installed and `com.tvapp.v2.main` launched successfully.
- Vega CLI confirmed that the application process remained running.
- Visual loading-screen and D-pad focus-path confirmation remain manual because
  the physical Vega image does not provide `screencap` or remote key injection.

## Verification

- Root TypeScript check passed.
- Android Studio module TypeScript check passed.
- Vega TypeScript check passed.
- Android and Vega ESLint checks passed without warnings.
- Four shared Jest tests passed.
- Android release build passed.
- Vega debug builds passed for all configured architectures.
