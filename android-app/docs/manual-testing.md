# Manual Testing

## Google TV / Android TV with Android Studio

1. Open Android Studio and choose `Open`.
2. Select `android-app/android`.
3. Set the Gradle JDK to Java 17 under Settings > Build Tools > Gradle.
4. Start an Android TV emulator, or enable Developer options and USB/network
   debugging on a physical Google TV.
5. Select the `app` run configuration and the TV device, then press Run.

For a standalone APK, build from the repository terminal:

```sh
cd /Users/vitalythirulnikov/projects/tv-app/android-app
JAVA_HOME=$(/usr/libexec/java_home -v 17) npm run build:android:release
```

Install it on the selected ADB device:

```sh
adb devices -l
adb -s DEVICE_SERIAL install -r android/app/build/outputs/apk/release/app-release.apk
adb -s DEVICE_SERIAL shell monkey -p com.tvapp.v2 -c android.intent.category.LEANBACK_LAUNCHER 1
```

The Release APK contains the JavaScript bundle and does not need Metro.

For live development, run `npm start` in `android-app`, then use Android
Studio Run with the debug variant. For a physical device also run:

```sh
adb -s DEVICE_SERIAL reverse tcp:8081 tcp:8081
```

## Fire TV Vega with Vega Studio

Vega OS does not install APK files and is not run by Android Studio.

1. Open VS Code with the Amazon Vega Studio extension.
2. Add `android-app/platforms/vega` as a Vega project.
3. Connect the Vega Fire TV in Developer Mode, or start `VirtualDevice:Tv`.
4. Choose Debug and use Vega Studio's Build and Run actions.

The equivalent terminal flow is:

```sh
cd /Users/vitalythirulnikov/projects/tv-app/android-app/platforms/vega
npm install
/Users/vitalythirulnikov/vega/bin/kepler project doctor
npm run build:debug
/Users/vitalythirulnikov/vega/bin/kepler device list
/Users/vitalythirulnikov/vega/bin/kepler device install-app \
  --packagePath build/armv7-debug/tvappv2vega_armv7.vpkg
/Users/vitalythirulnikov/vega/bin/kepler device launch-app \
  --appName com.tvapp.v2.main
```

Amazon's Vega documentation specifies the `armv7` package for a physical Fire
TV. The Vega virtual device uses the package matching its reported architecture,
commonly `x86_64` on an Intel Mac.

## Expected Stage 1 Screen

- `TV App v2` and `Foundation diagnostics`.
- Correct detected platform and package format (`APK` or `VPKG`).
- Backend status becomes `Connected` and shows a real live-channel count.
- Reload, Focus target A and Focus target B receive visible D-pad focus.
- The last remote event updates after directional/select/back input.
