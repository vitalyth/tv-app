# Stage 1 Baseline

Recorded on 2026-09-21.

## Android TV

- Device: Chromecast with Google TV (`sabrina_prod_stable`), 1920x1080.
- Release APK cold activity launch: 943 ms (`am start -W`).
- Backend state: connected.
- Live channel count: 119.
- Remote focus: preferred focus landed on Reload; Right moved to Focus target A.
- Remote event reporting: `right` displayed after the D-pad event.
- Release APK size: approximately 47.7 MB.

## Vega OS

- SDK: Vega 0.24.9914, CLI 1.3.4, target OS 1.2.
- Debug VPKG builds passed for aarch64, armv7 and x86_64.
- VPKG size: approximately 2.08 MB per architecture.
- `vega project doctor`: all critical compatibility checks passed.
- Device: physical Fire TV (`calypso`), Vega OS 1.2 TV Ship/48, armv7l.
- The armv7 VPKG installed successfully and `com.tvapp.v2.main` launched with
  its process running.
- Device logs reported 83 surface mutations across three transactions with no
  application crash observed during launch.
- Focus, backend connectivity and cold-start timing still require manual
  confirmation on the Fire TV screen.

## Backend

- API: `https://tv.bestcams.net/api`
- Version: 0.1.3.
- `/live_channels`: 119 records.
- Three host-side request samples: 390 ms, 208 ms, 379 ms (326 ms average).
