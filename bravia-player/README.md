# Bravia direct stream player

Standalone Android TV player for channels from the source site. It resolves a fresh stream URL on the television, sends the source site's required headers, and bypasses stale HLS manifest caches. Playback and reconnection run entirely on the TV; no computer or local server is required. Open **TV Streams** from the television's apps to resume the last selected channel.

Build with JDK 17 and the Android SDK:

```sh
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.tvapp.braviastream/.MainActivity --es channel yes-5 --es title "Sport 5"
```

The upstream website and stream must remain available. If their address or API changes, the application will need updating.
