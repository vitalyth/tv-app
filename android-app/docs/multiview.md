# Multi View

## Reference and Controls

The interaction reference is the older Kotlin application:
`android-tv-app/android/tv-app/src/main/java/com/tvapp/programguide/ui/ProgramGuideApp.kt`
(`ExpandedPlayer`, `MultiPlayerGrid`, `MultiPlayerOverlayView`).

- The fullscreen player's Multi View button opens the shared channel menu, focused
  on the active channel. The player/grid animates aside using the same viewport
  transition as fullscreen channel selection.
- Add opens the channel menu while capacity remains. Left navigates between
  tiles or actions without opening the menu.
- Existing channels remain listed. Choosing one focuses its tile without resolving
  or duplicating its stream; choosing a failed channel retries its existing slot.
- Two columns fill the available screen with a 2-point gap and 8-point outer
  inset; three/four channels use two rows.
- Left, Right, Up and Down move tile focus. Only the focused, ready tile is audible.
- Unlike the old app's one-second audio delay, audio follows focus immediately.
- Loading/failed focused tiles silence the others instead of playing another tile's audio.
- Rounded information panels appear on entry or a change of focused channel, then
  hide after 4.5 seconds. Playback ticks and action-button navigation do not reveal them.
- Select reveals compact Fullscreen / Add / Change channel / Remove icons inside
  the focused tile. Change channel replaces that tile, including when the grid is
  full, and leaves the other streams playing.
- The icons hide after 4.5 seconds. Right past the last tile opens Add when capacity permits.
- Back closes the channel picker, then returns to the original fullscreen stream.
- Hardware play/pause affects playback; volume does not reveal controls.

## Playback and Limits

The existing MediaController and persistent MediaLayer own all surfaces. Entering,
browsing, and exiting do not resolve or remount the original stream. Removing its
tile or promoting another channel is an explicit playback change.

Android supports at most four streams. Vega is capped at two streams after
physical-device tests consistently lost a picture when a third player started.
This is an application safety limit, not a documented universal hardware maximum.
Quality targets match the old app
(180p / 260 kbit/s), with
the lowest available rendition when the target does not exist. 4K-only streams are
rejected in tile mode. Decoder errors and startup timeouts release the affected
surface and leave other streams available.

Android tile players use `disableFocus` to avoid competing audio-focus requests.
Muting changes volume, never pause state. Without this, react-native-video pauses
earlier players on `AUDIOFOCUS_LOSS` when another tile starts.

### Experimental Vega Focus Recovery

The experimental recovery path is inactive under Vega's two-stream cap.
With three or four tiles on Vega, gaining audio focus schedules recreation of
that tile's native player after 650 ms. Rapid browsing cancels the pending
recreation. The old player is released before its replacement starts; sibling
players are not intentionally restarted. Android and one/two-tile playback are
unchanged. Exiting multiview cancels pending recovery without recreating the
surviving primary player.

This is a workaround, not black-frame detection: Vega can report PLAYING and an
advancing media clock while the picture is black. Consequently every settled
focus change in three/four-tile mode can reload even a currently visible tile,
with a brief interruption and a return to the stream's live start position.
Recovering one picture can make another tile black; this does not enable four
simultaneously visible pictures.

### Sony Android 12 surface release workaround

On BRAVIA VH2 (Android 12/API 31), the system `c2.android.avc.decoder`
crashed in `libcodec2_soft_avcdec.so` just after switching to a placeholder surface
while releasing a Multi View tile (2026-10-31 21:53:28). The codec service died,
then Android's MediaCodec STOPPING assertion aborted the app.

`configure-bravia-codecs.js` installs `TvAppRenderersFactory`, which enables
Media3's surface-switch workaround for that decoder on Sony API 31. Media3
releases the decoder rather than switching a running software decoder to a new
surface. The normal hardware/software decoder selection, four-tile limit, and
native playback on focus changes are preserved. Other devices use the default
renderer factory.

This TV's `/vendor/etc/media_codecs_4k.xml` advertises two concurrent hardware AVC
instances. Four-tile playback therefore needs software fallback for additional
AVC streams, which costs CPU time. A temporary test excluding software fallback
kept two channels playing but prevented the third/fourth; that exclusion was
removed in favor of the surface-lifecycle workaround.

### Multi View update overhead

Multi View does not display a timeline, so native progress events no longer
publish timeline state through the shared media controller while the grid is
open. Fullscreen progress resumes on the next event after exit. Android grid
players report progress once per second rather than four times per second.
Repeated track lists retain their existing selection and quality state, and
native source/buffer configuration objects stay stable during focus changes.

BRAVIA sample (2026-10-31, channels 12/13/Sport 5/Sport 1): process CPU averaged
about 137% before and 122% after these changes (100% means one CPU core).
Software decoder CPU remained about 156%; audio post-processing and compositor
CPU stayed similar. Samples cover a few seconds of live content rather than a
controlled benchmark. The fourth stream still needs costly 1080p software AVC
decoding. Lower bitrate selection cannot resize a stream that only has an HD
rendition; further reductions there require a lower-quality source or upstream
transcoding.

## Verification

- BRAVIA VH2 Android 12 (2026-10-31): four live channels (11/12/13/14)
  rendered with the surface workaround active. Changed a software-decoded tile,
  removed/re-added both software tiles, navigated the grid, and returned to
  fullscreen with the same app process and no new native crash. This is a smoke
  test, not long-duration stability qualification.
- Secondary media tiles now subscribe to stable playback actions and skip renders
  when their own media/audio state has not changed. A regression test checks that
  primary timeline updates and focus changes do not render unaffected tiles.


- Focus-recovery release installed on physical Fire TV 192.168.1.108. A black
  channel 13 tile regained its picture after recreation, while channel 12 became
  black. In a subsequent three-tile session, moving focus to the black primary
  channel 23 restored its picture while channel 11 became black. Long-duration
  reliability and four-tile focus recovery are not qualified. Moving focus next
  to black channel 11 restored its picture and displaced channel 12 instead.
- 256 automated tests pass, including the Vega two-stream controller/UI cap,
  Android four-stream playback, targeted player teardown/recreation,
  cancellation during rapid navigation, and fullscreen player continuity.
- Controlled three-clip Vega test (2026-10-23): reproduced with independent local
  H.264 Baseline/AAC MP4s, 160x90 at 5 fps, about 1 MB each. Two pictures rendered;
  starting the third made the first black. All three clocks continued advancing;
  two subsequent captures showed only tiles 2 and 3 moving. See
  [decoder diagnostic](decoder-diagnostic.md). This bypasses Shaka and live
  providers, but does not prove a documented hardware decoder maximum.
- Latest four-tile Fire TV test: FAILED. On `192.168.1.108`, adding the third
  and fourth channels leaves earlier tiles black while their audio remains
  audible when focused. Surface reattachment and native-plane recreation did
  not resolve this. Hardware/decoder limits have not been confirmed. The
  four-stream experiment has now been disabled on Vega; its cap is two.
- The original Android emulator rendering fix used TextureView on emulator hardware
  only; player panel animation now uses it on physical Android TVs as well (see
  [Android video rendering](android-video-rendering.md)). Fullscreen fits the complete
  frame. Four-tile emulator captures after the original fix showed
  movement in all four video regions, with four active native audio tracks and
  exactly one unmuted track.

- 244 automated tests pass, including focus-only audio, four-tile navigation,
  bounded player count, asynchronous cancellation, cleanup and primary continuity.
- Android TV 4K emulator: four live channels rendered, all four changed pixels
  between captures while focus moved. AudioFlinger reported four active app tracks,
  exactly one with nonzero gain; the nonzero track changed with tile focus.
- Four-stream emulator sample: 258377 KiB PSS, 353228 KiB RSS. This is a smoke-test
  sample, not a memory-leak or long-duration performance qualification.
- The revised old-style UI has not yet been qualified on physical Google TV or
  Vega hardware. An earlier two-stream UI had rendered on Vega, but that does not
  verify this revision's focus audio or long-duration behavior.

Icons `add.png` and `fullscreen.png` are rasterized Lucide Plus / Maximize icons.
