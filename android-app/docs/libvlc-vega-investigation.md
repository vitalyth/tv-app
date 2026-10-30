# libVLC on Vega: Software Decoder Experiment

## Scope

Investigated on 2026-10-24/25 as a client-only alternative to the current W3C media
pipeline. A generic GNU/Linux ARMv7 libVLC build now runs on the physical Fire TV
and produces changing CPU frames from four independent software decoders.
A second prototype uploads their YUV planes to a single hardware-backed EGL
pbuffer and renders four color video quadrants with an OpenGL ES shader.
The app now has an explicit experimental software-decoder mode in Multi View.
The default W3C path retains its two-stream Vega limit; Android TV is unchanged.
The integration is distinct from the successful offscreen experiments below.

## Evidence

- VideoLAN's maintainer describes a working native Vega application using
  libVLC 4, a custom Qt platform plugin, platform hardware decoders, and a
  zero-copy path to the display compositor:
  <https://jbkempf.com/blog/2026/vlc-vegaos/>.
- This establishes that a Vega port exists, not that four simultaneous videos
  work, nor that the Vega port exposes GPU texture output to our application.
- No libVLC libraries or headers were found among the installed Vega SDK
  0.24.9914 package/workspace filenames.
- The GitHub VideoLAN VLC master tree was enumerated through its recursive tree
  API (not truncated). No paths matched Vega, Kepler, Orpheus, or Amazon.
  The public branches inspected did not expose a Vega-specific branch.
- VideoLAN GitLab public project searches for Vega, Kepler, vlc-vega, and Qt
  returned empty arrays. These checks do not establish that the port's source
  is unavailable everywhere; a separate repository, branch, or distribution may
  need to be obtained from VideoLAN.
- The official download root and testing listings inspected did not identify a
  Vega libVLC development package.

## Physical Device Probe

`scripts/native/vega-libvlc-probe.c` is a read-only dependency preflight. It can
accept an explicit library path for a future separately supplied build. It does
not initialize a player, decode media, alter app state, or test renderer capacity.

Cross-compiled with the existing module's Vega ARMv7 toolchain, using
`-Wall -Wextra -Werror`, then pushed to `/tmp/tv-vega-libvlc-probe` and executed on
Fire TV `192.168.1.108:5555`:

```text
UNAVAILABLE libvlc.so: cannot open shared object file: No such file or directory
UNAVAILABLE libvlc.so.12: cannot open shared object file: No such file or directory
UNAVAILABLE libvlc.so.5: cannot open shared object file: No such file or directory
RESULT: LIBVLC_NOT_LOADABLE; four-player test NOT RUN
```

Exit status was 2, the expected missing-dependency result. This only tests the
shell process's default loader search path. It says nothing about libraries
bundled privately in another application or about whether a future app-bundled
libVLC build will load successfully. Installing the VLC app does not by itself
provide a documented shared libVLC service to our React Native app.

## Source Build

The Vega-specific VLC GUI port is not required for this CPU-only experiment.
This is not an Android APK/JNI library or a desktop prebuilt binary.

- VLC master pinned to `99f4e71f10d28ef73bc6157672622ebb90e2f577`, from
  <https://github.com/videolan/vlc/tree/99f4e71f10d28ef73bc6157672622ebb90e2f577>.
- FFmpeg `n7.1.1`, from <https://github.com/FFmpeg/FFmpeg/tree/n7.1.1>.
- Host tools: autoconf, automake, GNU libtool, gettext/autopoint, pkg-config,
  make, flex, and bison. Only the selected plugins are built; the full VLC tree
  additionally requires a newer bison than the macOS system version.
- Use the already-generated native module toolchain under
  `platforms/vega/packages/vega-user-engagement/build/private`, including its
  Mac ARMv7 compiler, sysroot, and Clang resource directory.
- Explicitly select `ld.lld` / GNU linker semantics. Letting libtool discover
  macOS `/usr/bin/ld` produced unusable link artifacts. Pass `-resource-dir`
  through libtool with `-Xcompiler`; otherwise it silently drops that flag.
- `ffmpeg-7.1.1-h264-only.patch` adds the film-grain object referenced by
  `h2645_sei.o` but missing from this release's H264-only object list. Without
  it the plugin fails at runtime with `ff_aom_uninit_film_grain_params` missing.

Extract the pinned source archives to `/tmp/vlc-<revision>` and
`/tmp/FFmpeg-n7.1.1`, and run `./bootstrap` in the VLC source directory. Then,
from `android-app`:

```sh
bash scripts/native/build-vega-libvlc-experiment.sh
FRAME_WIDTH=640 FRAME_HEIGHT=360 OUTPUT_I420=1 \
  bash scripts/native/build-vega-libvlc-experiment.sh
```

`WORK`, `VLC_SOURCE`, and `FFMPEG_SOURCE` can override the temporary directories.
Use `RECONFIGURE=1` to rerun VLC configure after changing its configuration;
clean the relevant generated build targets when changing linker configuration.
The script emits a separate bundle in `/tmp/tv-vega-libvlc/device`. It does not
modify the app manifest, register a TurboModule, or install an application.

Only filesystem, MP4 demux, H264 packetizer, FFmpeg software decoder, swscale,
memory video output, dummy window, and console logging plugins are bundled.
There are no hardware decoder/device plugins. `libvlc_video_set_callbacks()`
also selects `dec-dev=none`, `vout=vmem`, and `window=dummy` in this pinned source.
Audio is disabled. TLS, network/HLS playback, DRM, and native audio output are
not included or qualified by this experiment.

## Four-Decoder Test

Run the bundle under the VDA developer shell on `192.168.1.108:5555`. The normal
app is not replaced or terminated by these commands. A repeated `vda push` of a
directory may nest its basename; use `device/.` to update the existing contents:

```sh
vda -s 192.168.1.108:5555 shell mkdir -p /tmp/tv-vlc-experiment
vda -s 192.168.1.108:5555 push /tmp/tv-vega-libvlc/device/. /tmp/tv-vlc-experiment/
vda -s 192.168.1.108:5555 shell 'LD_LIBRARY_PATH=/tmp/tv-vlc-experiment/lib VLC_PLUGIN_PATH=/tmp/tv-vlc-experiment/lib/plugins /tmp/tv-vlc-experiment/vega-libvlc-decode-test /tmp/tv-vlc-tile-1.mp4 /tmp/tv-vlc-tile-2.mp4 /tmp/tv-vlc-tile-3.mp4 /tmp/tv-vlc-tile-4.mp4'
```

Copy the fixture MP4 files separately to those paths. The benchmark starts four
independent media players, checks sampled frame hashes every second, and saves
a CPU-composed PPM grid at seconds 10, 20, and 30. I420 snapshots intentionally
show only the Y/luma plane in grayscale; decoding still includes U and V.
The RGBA snapshots show color. These files are offscreen evidence, not device
screenshots or proof of a functioning compositor/React Native integration.

The result `FOUR_CPU_DECODERS_PASS` requires at least 100 changing frames per
player and no more than two unchanged one-second intervals after warmup.
It does **not** require meeting source frame rate. Callback counts can exceed
decoded frame counts because VLC may present the same picture repeatedly;
`changes` is the relevant counter. Current code also reports monotonic wall
time and change rate; early runs below predate that timing instrumentation.

| Source x Four Players | CPU Output | Changes After 30 Intervals | Process CPU Seconds | Peak RSS KiB |
| --- | --- | --- | --- | --- |
| 160x90, H264 Baseline, 5 fps | RGBA 160x90 | 150 each | 4.782 | 13,408 |
| 640x360, H264 Main, 25 fps | RGBA 640x360 | 643 / 612 / 655 / 638 | 75.163 | 54,456 |
| 640x360, H264 Main, 25 fps | I420 640x360 | 751 / 751 / 751 / 752 | 20.634 | 47,252 |
| 1280x720, H264 Main, 25 fps | I420 1280x720 | 747 / 745 / 748 / 746 | 57.129 | 159,504 |

All four runs exited 0 with four changing CPU outputs. RGBA 360p missed source
frame rate and emitted repeated late-picture warnings. I420 360p sustained
approximately source rate after startup, with some late-picture warnings.
The tiny RGBA run hashed every byte; later runs sample every 16th byte, so its
CPU time is not directly comparable to the larger runs. CPU seconds sum all
process threads, not wall time, and exclude the rest of the device's workload.

Tiny inputs were four distinct 120-second clips with moving test patterns and
time counters, already used for the native diagnostic. Larger tests use four
independent decoders of the same synthetic local MP4 (40 seconds, x264 Main,
25 fps, CRF 23, veryfast). They do not simulate four network providers or the
complexity/bitrate of every real channel.

The 720p CPU-only run took 31.908 seconds including diagnostics, reporting
23.38-23.54 changing frames/second and zero stalled sampling intervals in all
four players. It emitted late-picture warnings. These are short tests, not
long-duration playback qualification.

Example source generation:

```sh
ffmpeg -f lavfi -i testsrc2=size=640x360:rate=25 -t 40 -an \
  -c:v libx264 -preset veryfast -profile:v main -crf 23 -pix_fmt yuv420p \
  /tmp/stress-360p25.mp4
```

## Hardware GPU Composition Experiment

`vega-egl-probe.c` dynamically loads system EGL and GLES, creates a pbuffer,
draws four colored quadrants, and verifies their center pixels. Default-display
initialization failed with `EGL_NOT_INITIALIZED` (`0x3001`) under the standalone
developer shell. `EGL_PLATFORM=surfaceless` succeeded and reported:

```text
EGL=1.5 VENDOR=Mesa Project
GL_VENDOR=Mesa
GL_RENDERER=Mali-G310 (Panfrost)
GL_VERSION=OpenGL ES 3.1 Mesa 24.3.1
RESULT=FOUR_QUADRANTS_PASS
```

This was hardware rendering, not an llvmpipe software renderer. It is an
offscreen pbuffer, not a native application window.

`vega-yuv-renderer.c` then combines the actual four decoder buffers on that
same kind of GPU surface. The benchmark's main thread owns the GL context;
decoder threads only write their own mutex-protected YUV buffers. Each tile
owns three textures. The shader samples Y/U/V directly, avoiding per-frame
CPU RGB conversion, and draws four 640x360 quadrants on a 1280x720 pbuffer.
Each source can still be decoded at 1280x720. The diagnostic shader assumes
limited-range BT.601 SDR; real-channel color metadata/HDR are not handled yet.

For this mode, obtain the standard headers from the official Khronos registry:
`EGL/egl.h`, `EGL/eglplatform.h`, `KHR/khrplatform.h` from
<https://github.com/KhronosGroup/EGL-Registry/tree/main/api>, and
`GLES2/gl2.h`, `GLES2/gl2platform.h` from
<https://github.com/KhronosGroup/OpenGL-Registry/tree/main/api>.
Put them under `/tmp/tv-vega-gl-headers` or set `GL_HEADERS` to the root.
No GLES/EGL desktop libraries are linked into or copied onto Fire TV.

```sh
FRAME_WIDTH=1280 FRAME_HEIGHT=720 OUTPUT_I420=1 GPU_OUTPUT=1 \
  bash scripts/native/build-vega-libvlc-experiment.sh
```

After pushing the updated bundle, prefix its device invocation with
`EGL_PLATFORM=surfaceless` as well as the library/plugin paths above. The GPU
mode targets 25 redraws/second with monotonic absolute deadlines. At seconds
10/20/30 it reads back the GPU surface to `/tmp/tv-vlc-gpu-grid-<second>.ppm`.
Each quadrant must contain nonblack pixels and change from its preceding
snapshot, and all four CPU frame counters must independently pass. Successful
readback is logged as `FOUR_GPU_OUTPUTS_PASS`, still explicitly noting that
on-screen application rendering has not been tested.

Measured on physical Fire TV with four independent decoders of the same
720p/25fps fixture:

```text
GPU_RENDERER=Mali-G310 (Panfrost)
WALL_SECONDS=30.441 CPU_SECONDS=59.064 MAX_RSS_KIB=177712
tile1 CHANGED_FPS=24.57 STALLED_INTERVALS=0
tile2 CHANGED_FPS=24.61 STALLED_INTERVALS=0
tile3 CHANGED_FPS=24.47 STALLED_INTERVALS=0
tile4 CHANGED_FPS=24.44 STALLED_INTERVALS=0
RESULT=FOUR_GPU_OUTPUTS_PASS; four-picture on-screen test NOT RUN
```

All four GPU quadrants had 230,400 nonblack pixels and changed between the
10/20/30-second readbacks. The 10-second color grid was pulled and visually
inspected. The first attempted GPU playback correctly failed because its
temporary input MP4 was no longer on the device; the fixture was copied again
before the successful run. The benchmark now checks input readability before
starting any player. Temporary fixtures may need recopying between sessions.

A second GPU run used four **distinct** 160x90/5fps colored clips, scaled by
VLC to 640x360 I420 outputs before upload. All four quadrants had different
pixel hashes and changed across all three readbacks. A pulled color grid was
visually inspected; it showed four differently colored moving test patterns.
The run exited 0 after 30.408 seconds, with 4.97 changing frames/second and
zero stalled intervals in each player, 15.325 process CPU seconds, and peak
RSS 36,148 KiB. This checks independent texture/frame ownership in addition
to the higher-resolution same-fixture throughput test.

Validation also included `-Wall -Wextra -Werror` builds of both CPU-only RGBA
and GPU/I420 benchmark variants, shell syntax checking of the build script,
and a device invocation with a missing fixture. The latter returned 2 before
initializing players, as expected. No normal application test suite was run
for this isolated native experiment; production application code was unchanged.

## Remaining Work

This establishes that four H264 software decoders can produce changing CPU
frames on this device. It does not identify the original W3C/native-video
constraint as a decoder, surface, compositor-plane, or driver limit, and does
not show that four hardware players work.

Before lifting the production cap, connect this offscreen prototype to a
supported app-visible Vega surface/native view. Validate four moving pictures
in the app, native lifecycle,
memory/bandwidth, prolonged playback, audio focus, actual HLS/TLS sources and
available low-resolution variants. Native app permissions/packaging and license
notices for the bundled dependencies also need validation. No off-the-shelf
React Native VLC plugin has been qualified for Vega by this experiment.

libVLC's generic output APIs are documented at:
<https://videolan.videolan.me/vlc/master/group__libvlc__media__player.html>.
CPU-buffer output has documented performance penalties; neither its frame rate
nor four-way hardware texture output has been qualified on our device.

The client-only software/YUV route is now a measured prototype rather than a
missing-library hypothesis. It still needs a supported graphical output path
and real-channel qualification; the default production cap stays two until those pass.

## App Integration (2026-10-25)

- `TvAppVlcView.cpp` implements a React Native Vega UI component backed by one
  `makeGLSurfaceView` child window. Four libVLC H264 software decoders deliver
  640x360 I420 frames to the shared GPU shader, avoiding four W3C video surfaces.
- The existing Multi View layout, channel picker, loading/error states and remote
  navigation are retained. The settings-icon action switches decoder mode while
  there are at most two tiles. Its focused tooltip names the target mode.
- Software mode permits four tiles only when the ARMv7 native bundle was built.
  Unsupported builds hide this option. It is session-local and never silently
  replaces the standard backend. Remove extra tiles before switching back, or
  exit Multi View to return to the normal player.
- Focus changes leave all four native video URLs unchanged. One headless Shaka
  instance requests only the focused channel's audio (`manifest.disableVideo`).
  This creates an additional provider connection, not a fifth video surface.
  Audio startup latency/synchronization remains a device qualification item.
- Native generations discard obsolete surface events. Source identity is checked
  again in JavaScript. Video/network destruction runs off the UI thread; GPU
  ownership is serialized across overlapping teardown/remounts.
- The live build adds FFmpeg HLS/MPEG-TS/fMP4 networking and statically built
  OpenSSL 3.5.9. `ffmpeg-vega-tls.patch` enforces certificate verification for
  every TLS connection, including HLS child requests, and checks DNS/IP identity.
  It uses the device CA store at `/etc/ssl/certs/ca-certificates.crt`; invalid or
  missing trust material must fail, not downgrade to unverified TLS.
- Vega's app autolinker discovers only names ending in `.so` and flattens the
  library tree. `vlc-private-soname.patch` gives this private build unversioned
  SONAMEs; the UI library, libVLC/core and plugins are packaged together. The UI
  component uses `$ORIGIN` RPATH and discovers plugins beside itself.

Build the live inputs separately before the normal native/app Release build:

```sh
WORK=/tmp/tv-vega-libvlc-live LIVE=1 FRAME_WIDTH=640 FRAME_HEIGHT=360 OUTPUT_I420=1 \
  bash scripts/native/build-vega-libvlc-experiment.sh
bash scripts/native/prepare-vega-vlc-bundle.sh
npm run build:vega:release
```

Also prepare the OpenSSL 3.5.9 source under `/tmp/openssl-openssl-3.5.9` (or
`OPENSSL_SOURCE`) and the Khronos headers described above. Native inputs live
under the ignored module `build/vlc/armv7` directory; they are not committed.
Use a separate `WORK` directory when changing FFmpeg's `LIVE` configuration.
For the Intel Vega Virtual Device, use `ARCH=x86_64` and
`WORK=/tmp/tv-vega-libvlc-live-x86_64` for both native-input scripts, then build
the native module and app with `--targets x86_64` / `--target x86_64` respectively.
This builds the same software decoder/compositor rather than the unsupported
placeholder. Its performance must not be interpreted as physical Fire TV capacity.
Re-link generated VLC library targets when changing SONAME/linker options;
Automake does not necessarily detect command-line LDFLAGS changes.

Current limitations: H264 SDR only; no HEVC/AV1, DRM or DASH video support in the
software build. Output currently uses a fixed 16:9/BT.601-limited conversion,
not source-aware HDR/color/aspect metadata. Real HLS providers, app-window GPU
permissions, four visible live pictures, audio focus/drift, reconnection and
long-duration CPU/memory/thermal behavior require on-device qualification.
`createDisplayControllerForSystemClients` availability for an app-owned child
window is not established by the offscreen GPU experiment. Errors are reported
to the existing tile UI; no system privilege is added to bypass a failure.

The build stages VLC, FFmpeg LGPLv3 and OpenSSL notices in the native module.
The live FFmpeg build uses `--enable-version3`; public distribution requires a
separate license/source/relinkability review and ensuring notices survive final
Vega app packaging. These experimental dependencies are pinned for reproducibility,
not certified as release-ready or a substitute for an upstream security audit.

### Integration Validation

- ARMv7 native UI/engagement libraries compiled successfully.
- ARMv7 app Release packaging and Vega ABI validation passed. The packager emits
  its expected warning about dynamically loaded plugins/GLES; those runtime
  dependencies still require device validation.
- TypeScript and ESLint passed; Jest passed 258 tests in 32 suites, including
  software opt-in limits, default Vega cap, backend preservation, no W3C video
  surfaces in software mode, audio-only focus switching, stale events and exit.
- After the user's later request to install, the Release was installed and
  launched on `192.168.1.108:5555`. The app-running check passed and ordinary
  W3C playback appears in device logs. This does not prove the experimental
  backend's four live pictures.
- Automatic visual qualification was unavailable: the device screenshot client
  failed creating its shared buffer with `Permission denied`, and the UI-dump
  command timed out. A user confirmation of software-mode output was requested.
  No additional privilege or security-policy exception was added to bypass this.

### Vega Virtual Device Test (2026-10-27)

The native-input build and staging scripts now support `ARCH=x86_64`, with a
separate toolchain, sysroot, OpenSSL target and FFmpeg CPU configuration. ARMv7
defaults are preserved. CMake selects the matching bundle and enables the real
native component on either supported architecture when its inputs are present.

The Intel x86_64 Release (including VLC, not the unsupported stub) passed ABI
validation, was installed on `emulator-5554` and launched successfully. Live
channel 11 played in background/fullscreen and in standard Multi View. Switching
to software mode reproduced the failure before any VLC source was opened:

```text
Incompatible context and surface.
Context and Surface are not compatible. Make Current Failed.
[VlcMultiView] tile state { index: 0, state: 'error', detail: 'make-current' }
```

This still fails with system-default context depth/stencil/sample/presentation/
compression preferences. It is not a successful four-stream test. This evidence
locates the current startup failure in graphics context/surface binding rather
than channel loading; it does not resolve the original hardware concurrency
limit. The required graphics module was matched against the device/module list:
`/com.amazon.kepler.kepler_graphics_2@IKeplerGraphics_1`. The older SDK guide's
`/com.amazon.kepler.graphics@IObjectFactory3` dependency was unavailable and its
installation attempt was rejected; it was not kept in the app manifest.

Switching back to the standard backend recovered playback. Channels 11 and 12
were then displayed together, and the emulator was left open in that mode.
Host-window screenshots were inspected (`/tmp/tv-vega-grid-before.png`,
`/tmp/tv-vega-software-error.png`, `/tmp/tv-vega-standard-two.png`). The guest
screenshooter still failed allocating its shared buffer, and QMP screendump
returned an all-black image despite visible guest UI/video; neither was treated
as proof of missing app output. Host capture required the current window ID.

The virtual device initially exited repeatedly. A SwiftShader attempt did not
provide a usable VDA connection. The temporary GPU configuration change was
restored, and the standard SDK launcher was started detached; the subsequent
host-rendered instance remained available through the test. Physical Fire TV was
not installed or modified during this emulator test. Jest passed 258 tests in
32 suites; TypeScript, ESLint and shell syntax checks passed.
