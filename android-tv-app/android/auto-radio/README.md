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

## Test With Android Auto

Run the backend first:

```sh
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Install the debug APK on a phone or emulator, then test with Android Auto Desktop Head Unit or a compatible Android Auto environment. The car UI should show one browsable root, `תחנות רדיו`, with the radio stations returned by `/radio_channels`.

## Scope

This module is radio-only:

- no TV channels
- no video playback
- no VOD
- no program or episode browsing
