# TV App Android Wrapper

This Android app is a quick installable wrapper for:

```text
https://tv.bestcams.net/tv
```

It is configured for Android phones and Google TV / Android TV:

- app name: `TV App`
- application id: `net.bestcams.tv`
- TV launcher category and TV banner
- touchscreen is not required
- JavaScript, DOM storage, media playback, Back navigation, and WebView fullscreen support

## Build APK

Install JDK 17, Android SDK Platform 36, Android SDK Build Tools 36, and Gradle or use Android Studio to open this directory. Then run:

```sh
gradle :app:assembleDebug
```

The debug APK is created at:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Install With ADB

Enable developer options and USB or network debugging on the Android device, then run:

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
