# Vega Three-Player Diagnostic

This is an isolated manual test, not the production application entry point.
`platforms/vega/src/DecoderDiagnostic.tsx` uses native VideoPlayer directly,
without Shaka/MSE, EPG, provider streams, or focus-driven playback changes.
Three fixed-size slots mount at 3, 20, and 40 seconds; earlier slots never resize.

## Fixtures and Launch

Create `/tmp/tv-decoder-clips` and generate three independent clips, varying the
hue value for each output:

```sh
ffmpeg -f lavfi -i testsrc2=size=160x90:rate=5 \
  -f lavfi -i anullsrc=r=48000:cl=mono -vf hue=h=0 -t 120 \
  -c:v libx264 -profile:v baseline -level 1.0 -pix_fmt yuv420p \
  -preset ultrafast -crf 30 -c:a aac -b:a 32000 -movflags +faststart \
  /tmp/tv-decoder-clips/tile-1.mp4
node android-app/scripts/serve-decoder-fixtures.js /tmp/tv-decoder-clips
```

Repeat for tile-2.mp4 and tile-3.mp4 with hue 120 and 240. The tested fixtures
also contained a burned-in frame/time counter for visual inspection.

Set CLIP_ORIGIN in the diagnostic to the host's current LAN address (port 8766).
Temporarily import DecoderDiagnostic as App in `platforms/vega/index.js` and add
an allowlist for that host only to `platforms/vega/manifest.toml`:

```toml
[network-traffic-policy.cleartext]
allowed-domains = ["192.168.1.107"]
```

Build the Vega release, terminate the old app, install, then launch. Capture
`loggingctl log -f -v com.tvapp.v2` before launch and compare screenshots before
and after the third player starts. A PLAYING event or advancing currentTime is
not sufficient evidence that a picture is visible. Native URL mode returned
videoWidth/videoHeight zero even for visibly playing clips; those fields are
not used as a pass/fail condition.

After testing, restore the normal App import, remove the temporary cleartext
allowlist, rebuild and reinstall the normal app, and stop the fixture server.
Do not ship the diagnostic entry point or a broad HTTP exception.

## Result: 2026-10-23

- Device: physical Vega Fire TV, 192.168.1.108.
- Fixtures: 120-second H.264 Constrained Baseline, 160x90, 5 fps, silent AAC-LC;
  first fixture 1,003,131 bytes. All three requested successfully by the native
  GStreamer HTTP client after adding the temporary host allowlist.
- Initial attempt was invalid: HTTP was blocked by native cleartext policy;
  even one clip did not play. This was not a decoder-count result.
- Valid attempt: tiles 1 and 2 rendered together. Starting tile 3 made tile 1
  black while tiles 2 and 3 rendered. Two captures approximately 18 seconds
  apart confirmed this persisted and both remaining pictures advanced.
- The black tile's clock advanced from 41 to 59 seconds, and paused remained
  false. The other two clocks also advanced. Silent fixtures do not test audible
  playback or focus routing.
- Sample after three started: CmaTotal 139264 KiB, CmaFree 30412 KiB. This single
  measurement does not rule out other resource limits or driver allocation rules.

The failure is reproducible without high-resolution streams, live networking,
Shaka, or layout resizing. A native rendering-plane/driver/decoder constraint is
plausible, but its exact layer and any supported bypass remain unconfirmed.
Do not describe this as a proven universal two-player hardware maximum.

The next independent workaround to validate is a server-composited mosaic sent
as one video stream, with only the selected channel's audio. That would avoid
multiple native video surfaces, but adds server transcoding and latency and has
not been implemented or tested by this diagnostic.
