# TV App Radio for Android Auto

Native Kotlin media app for Android Auto. It exposes only live radio stations from the existing backend.

## Backend Endpoints

The app uses the endpoints that already exist today:

- `GET /radio_channels` for the station catalog
- `GET /stream?channel_id={stationId}` for playback through the existing backend proxy

It does not read `linkDetails.link` directly and does not resolve radio streams on Android.

## Build

From `android-tv-app/android`:

```sh
./gradlew :auto-radio:assembleDebug
```

The default backend URL is:

```text
https://tv.bestcams.net/api
```

For local emulator development, override it with:

```sh
./gradlew :auto-radio:assembleDebug -PRADIO_API_BASE_URL=http://10.0.2.2:8000
```

For a physical phone on your local network, use the computer LAN address that
runs the backend:

```sh
./gradlew :auto-radio:assembleDebug -PRADIO_API_BASE_URL=http://192.168.1.50:8000
```

## Radio Catalog Source

The app can load the radio catalog from either:

- the existing API proxy: `GET /radio_channels` and `/stream?channel_id=...`
- the bundled static JSON file: `src/main/res/raw/radio_channels.json`

Use the small `API` / `JSON` button in the phone app header to switch sources.
The choice is stored in shared preferences and is also used by Android Auto.

Static JSON entries may include direct stream fields so playback does not need
the proxy:

```json
{
  "id": "rd_90",
  "name": "90FM רדיו תשעים",
  "type": "radio",
  "logo": "https://example.com/logo.jpg",
  "streamUrl": "https://example.com/live/icecast.audio",
  "mimeType": "audio/aac"
}
```

Supported stream URL field names are `streamUrl`, `stream_url`, `url`, `link`,
and `linkDetails.link`.

## Test With Android Auto

Run the backend first:

```sh
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Install the debug APK on a phone or emulator, then test with Android Auto Desktop Head Unit or a compatible Android Auto environment. The car UI should show one browsable root, `תחנות רדיו`, with the radio stations returned by `/radio_channels`.

For Desktop Head Unit, start the Android Auto head unit server on the device before
launching DHU:

```sh
adb kill-server
adb start-server
adb devices -l
adb forward --remove-all
adb forward tcp:5277 tcp:5277
/usr/local/share/android-commandlinetools/extras/google/auto/desktop-head-unit
```

On the device, Android Auto developer mode must be enabled, the overflow menu must
show the head unit server as running, `Previously connected cars > Add new cars to
Android Auto` must be enabled, and the screen should stay unlocked for the first
connection prompts.

If DHU logs `Failed to read from transport - disconnect. Exiting...`, ADB
connected to port 5277 but Android Auto closed the projection handshake. Restart
the head unit server from the device, confirm the persistent server notification is
visible, then re-run the forwarding commands above.

## Scope

This module is radio-only:

- no TV channels
- no video playback
- no VOD
- no program or episode browsing
