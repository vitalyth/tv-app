# Android Video Rendering

Android fullscreen uses `contain` to preserve the complete source frame. Background
playback retains `cover`; Multi View also uses `contain`. Presentation changes do
not replace the primary player or resolve its stream again.

The locally installed native video wrapper has a no-op `updateSurfaceView` method
and independently adds a top-left LIVE badge. The postinstall scripts hide that
badge and select a TextureView-backed PlayerView on Android emulator hardware
(`ranchu` / `goldfish`). Physical Android devices retain SurfaceView rendering;
Vega is unaffected. TextureView keeps emulator video in the UI compositor while
the player is resized between fullscreen and tiles.

These scripts are narrowly scoped to the custom wrapper. The emulator patch does
not alter upstream implementations with working surface selection, and fails if
the recognized custom implementation changes unexpectedly. Run `npm run postinstall`
after restoring or manually replacing local native video dependencies, then rebuild
the APK; a JavaScript reload cannot update native rendering code.
