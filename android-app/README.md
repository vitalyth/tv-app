# TV App v2 - Stage 1

Shared React Native TV foundation for two distinct runtimes:

- `android/`: Google TV / Android TV, built as an APK with `react-native-tvos`.
- `platforms/vega/`: Fire TV on Vega OS, built as a VPKG with Amazon's Vega SDK.
- `src/`: shared application, API, focus, i18n, state and media contracts.

## Toolchain

- Node.js 22.11 or newer
- Java 17 for the Android build
- Android SDK 36
- Vega SDK 0.24 for the Kepler build

## Development

```sh
npm install
npm start
npm run android
```

Use Java 17 when building Android:

```sh
JAVA_HOME=$(/usr/libexec/java_home -v 17) npm run build:android:debug
```

Vega is not an Android target and does not produce an APK:

```sh
cd platforms/vega
npm install
vega project doctor
npm run build:debug
```

The Vega output is a `.vpkg` package and is installed with `vega run-app`.
Vega uses the 512x512 icon declared in `manifest.toml`; its matching 16:9
banner is included under `platforms/vega/assets/image` for launcher/store use.

## Stage 1 Scope

The app intentionally contains only a diagnostic screen. Product navigation,
Home, EPG, VOD and playback UI begin in later approved stages.
