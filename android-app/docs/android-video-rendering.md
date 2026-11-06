# Android Video Rendering

Android fullscreen uses `contain` to preserve the complete source frame. Background
playback retains `cover`; Multi View also uses `contain`. Presentation changes do
not replace the primary player or resolve its stream again.

Android fullscreen exposes a subtitle selector for live and VOD playback only
when decoded subtitle data has been received. It lists available track names or
languages and an Off option; selection updates the existing player without
reloading the stream. Subtitles default to Off; enabled/disabled and preferred
language are saved locally and restored across source changes and app restarts.
Track indices are never reused across sources; the preference is matched by
language/name, falling back to an available verified track. Empty track lists do
not erase the user's preference.
The native subtitle renderer handles supported embedded DVB/CEA tracks and HLS
subtitle renditions. Burned-in captions cannot be switched off. Small Multi View previews keep text rendering disabled to preserve their playback
budget; the large main video uses the regular subtitle discovery and rendering. Discovery and
selection are currently wired to Android's react-native-video surface.
HLS chunkless preparation is disabled to discover captions inside the media.
While CC is Off, text tracks are sampled one at a time with the subtitle overlay
hidden; an empty service is not exposed in the menu and is sampled again later.
Once a verified track is showing, probing stops to avoid interrupting captions.
The subtitle-cues postinstall patch also reports bitmap DVB cue data. Small Multi View previews
do not probe or render captions. Validated tracks remain available during
pauses in dialogue and are cleared when the stream changes.

Android Multi View shares its active tile index between the media and overlay
layers. The active video always takes the left 72% of the available width; the
remaining videos stack on the right. Up/Down navigates only the small videos,
and Select promotes the highlighted video. Audio follows navigation focus,
including small-video preview; focusing the active video or its actions restores
audio to the active video. Adding or promoting a video places focus on the new main video with its bottom
panel closed. Removing a video likewise restores focus and audio to the main
video; audio synchronization checks the actual audio index after reindexing. Navigating alone never moves
or reconnects videos. Down past the last small video focuses the persistent
toolbar below the active video; Down from the main video focuses that
toolbar. Left from any small video focuses the main video, and Right returns to
the previously focused small video. The video moves up to reserve a 56-unit toolbar and 12-unit gap.
Toolbar controls receive native TV focus; the tile anchor becomes unfocusable
and every video focus border disappears. Up focuses the active video and shows
the same PlayerTopInfo/PlayerBottomControls used by fullscreen playback.
The top information appears on focus. The bottom panel opens only with Select
or a click; arrows never open it. Open panels hide after 4.5 seconds of inactivity.
Select reveals them without activating a control or leaving the active video.
Dialogs suspend hiding, and normal activity restarts the timeout. The embedded
controls omit the Multi View entry button; fullscreen playback still offers it. Down
returns to the external toolbar; Up from the timeline returns to the small column.
Up from the first small video also focuses the active video.
Left/Right cycles toolbar actions and never opens the channel picker. Add and Change open
that picker explicitly. Progress, pause, seek and regular quality choices belong to the displayed stream,
including secondary streams. Session snapshots are separate from global media
state so secondary progress does not rerender other decoders. Source changes
replace only the selected stream. Pending source requests are cancelled on Back.
Information panels are compact and sit at the top of each video. A solid tile
placeholder remains until the first frame; the canvas also has a persistent dark
background. Multi View always forwards contain to native video, including when
presentation props change, to preserve the entire source frame.
Video aspect ratios are preserved, with a 20-unit column gap, 24-unit vertical gaps, and no overlap. Promotion
uses a 200 ms native-driver translation/scale animation with a cubic ease-out curve.
Interrupted animations continue from the current position. The primary surface
retains its fullscreen canvas and extras retain half-screen canvases, so
activation does not resize or replace decoder surfaces. Unaffected extra players
remain memoized. Fullscreen playback and the large main video use the same
PlayerMediaSurface/RecoveringMediaSurface path and unrestricted regular quality
policy; only their displayed size differs. Small previews retain the 180p/260 kbps
budget and SurfaceView path, independent of count. Promoting/demoting a stream
updates its role on the existing player, including TextureView for the main video,
without resolving or reloading its source. Native PlayerView target switching
preserves ExoPlayer, listeners, playback position and buffer. Manual quality
selection follows the stream, and the main quality menu shows every available
rendition. Main subtitles use the regular saved preference and are scoped by
stream identity, so callbacks from demoted sources cannot overwrite their tracks.
Adding/removing other previews does not change an unaffected player's policy. The native
bitrate setter updates ABR without stop/prepare. Media surfaces share a stream-keyed
collection across primary/secondary/fullscreen roles, retaining their canvas and
player identity. Removing the primary only releases that stream; promoted survivors
retain playback state and cached quality options. Activation uses the shared
200 ms native transform animation without recreating or resizing the decoders.
Vega and the optional software compositor retain their existing layout.

The locally installed native video wrapper has a no-op `updateSurfaceView` method
and independently adds a top-left LIVE badge. The postinstall scripts hide that
badge and default to a TextureView-backed PlayerView on Android TVs and emulators.
TextureView keeps video in the UI compositor so the channel drawer and video
can animate together with the native animation driver. The same surface remains
attached throughout playback; opening the drawer does not switch surface types
or reconnect the stream. Vega is unaffected.

Extra Android Multi View tiles request SurfaceView to avoid composing all four
video frames through the application's RenderThread. `configure-surface-selection.js`
implements the custom wrapper's previously empty `updateSurfaceView` method,
using `PlayerView.switchTargetView` when a player is already attached. The large main
player uses TextureView; audio focus and drawer animations do not change
surface types. Emulators retain TextureView. On physical API 24+ devices the
extra surfaces participate in the grid's scale/translation animation.

BRAVIA VH2 smoke test (2026-11-03, Sport 5/Plus/Max/Stars): SurfaceFlinger showed
three extra SurfaceViews and all four pictures remained visible, including with
the channel drawer open. Six short RenderThread samples averaged 27.5% of one
CPU core before and 20.15% after. Process RSS was about 425–428 MB before and
367–385 MB after. Total app/system CPU did not show a comparable consistent
reduction: some composition work moves to SurfaceFlinger, and software video
decoding remains expensive. These live-content samples are not a controlled
frame-rate benchmark or long-duration stability test.

These scripts are narrowly scoped to the custom wrapper. The texture patch does
not alter upstream implementations with working surface selection, and fails if
the recognized custom implementation changes unexpectedly. Run `npm run postinstall`
after restoring or manually replacing local native video dependencies, then rebuild
the APK; a JavaScript reload cannot update native rendering code.
