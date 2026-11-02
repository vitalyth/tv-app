# Manual Testing

## Playback recovery

- Play live TV, interrupt the stream connection, then restore it. An explicit
  player error starts renewal immediately. After playback has started, confirmed
  buffering with an empty buffer, stopped playback and no progress starts a local
  seek after two seconds. A silent frozen position starts it after four seconds.
  If the seek fails to restore progress within two more seconds, renew the URL
  and reload the decoder. Polling adds at most about half a second.
- A short rebuffer must finish normally without reloading. Buffering alone must
  not restart advancing playback. Seeking gets up to five seconds of grace;
  resuming actual playback ends that grace. Initial loading gets ten seconds
  without new buffered data, with a 25-second cap while the buffer is growing.
- Confirm the reconnecting message appears and playback restarts even if the
  resolver returns the same URL. Live recovery must land within six seconds of
  the live edge; the player seeks to about three seconds behind it when needed.
  Normal manual timeshift is preserved until recovery is needed.
- Repeat with VOD: watch beyond its original resume bookmark, interrupt playback,
  and verify recovery resumes at the latest position. A completed episode must
  not be treated as a stuck stream or loop back to the beginning.
- Pause playback for at least a minute: it must not reload. Repeat while the app
  is in the background. Changing channel/source or seeking during renewal must
  discard the old result.
- An outage is retried at delays of 0, 1, 3, 7 and 15 seconds. Each successful
  reload gets a fresh startup window; renewal requests time out after 15 seconds.
  After five unsuccessful attempts the normal player error remains available.
  Thirty seconds of advancing playback resets the retry budget.
- In native Multi View, failing one tile must not reload healthy tiles. The
  optional software Multi View backend retains its separate native error path.

The combined event checks use the documented
[React Native Video v6 callbacks](https://docs.thewidlarzgroup.com/react-native-video/docs/v6/component/events/)
and [Media3 player states](https://developer.android.com/media/media3/exoplayer/listening-to-player-events).
Live-edge recovery follows [Media3 live playback guidance](https://developer.android.com/media/media3/exoplayer/live-streaming).
The timing thresholds above are app policy, rather than platform recommendations.

## Remote channel number entry

- From any page or the player, type a channel's displayed number on the remote
  (up to four digits). After 1.5 seconds without another digit, that channel
  opens in the full-screen player. For example, `55` selects Sport 5.
- Verify `49`, `51`, `55`, `57`, `60`, and `62` select the expected sports
  channels, including channels with no EPG. Sport 5 must retain both sources.
- An unknown number displays a message and leaves the current playback running.
- Back cancels entry without exiting playback. Navigation cancels pending entry;
  pressing Select retains its normal action. Holding a digit must not duplicate it.
- Digits entered into VOD search must remain search text. Backgrounding the app
  or starting another number while channels load must cancel the old request.
- Dialing from Multi View opens the selected channel alone, like opening a live
  channel from the home page.

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
