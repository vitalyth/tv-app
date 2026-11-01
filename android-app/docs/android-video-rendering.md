# Android Video Rendering

Android fullscreen uses `contain` to preserve the complete source frame. Background
playback retains `cover`; Multi View also uses `contain`. Presentation changes do
not replace the primary player or resolve its stream again.

The locally installed native video wrapper has a no-op `updateSurfaceView` method
and independently adds a top-left LIVE badge. The postinstall scripts hide that
badge and select a TextureView-backed PlayerView on Android TVs and emulators.
TextureView keeps video in the UI compositor so the channel drawer and video
can animate together with the native animation driver. The same surface remains
attached throughout playback; opening the drawer does not switch surface types
or reconnect the stream. Vega is unaffected.

These scripts are narrowly scoped to the custom wrapper. The texture patch does
not alter upstream implementations with working surface selection, and fails if
the recognized custom implementation changes unexpectedly. Run `npm run postinstall`
after restoring or manually replacing local native video dependencies, then rebuild
the APK; a JavaScript reload cannot update native rendering code.
