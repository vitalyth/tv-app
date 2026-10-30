#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
ARCH=${ARCH:-armv7}
if [[ "$ARCH" == armv7 ]]; then
  WORK=${WORK:-/tmp/tv-vega-libvlc-live}
else
  WORK=${WORK:-/tmp/tv-vega-libvlc-live-$ARCH}
fi
VLC_SOURCE=${VLC_SOURCE:-/tmp/vlc-99f4e71f10d28ef73bc6157672622ebb90e2f577}
FFMPEG_SOURCE=${FFMPEG_SOURCE:-/tmp/FFmpeg-n7.1.1}
GL_HEADERS=${GL_HEADERS:-/tmp/tv-vega-gl-headers}
DEST="$ROOT/platforms/vega/packages/vega-user-engagement/build/vlc/$ARCH"
test -f "$WORK/device/lib/libvlc.so"
test -f "$WORK/device/lib/libvlccore.so"
test -f "$WORK/device/lib/plugins/libavio_plugin.so"
test -f "$WORK/device/lib/plugins/libavformat_plugin.so"
READELF="$ROOT/platforms/vega/packages/vega-user-engagement/build/private/toolchain/$ARCH/mac/bin/llvm-readelf"
"$READELF" -d "$WORK/device/lib/libvlc.so" | rg -q 'Library soname: \[libvlc.so\]'
"$READELF" -d "$WORK/device/lib/libvlccore.so" | rg -q 'Library soname: \[libvlccore.so\]'
mkdir -p "$DEST/include/vlc" "$DEST/lib" "$DEST/licenses"
cp -R "$VLC_SOURCE/include/vlc/." "$DEST/include/vlc/"
if [[ -d "$WORK/vlc/include/vlc" ]]; then
  cp -R "$WORK/vlc/include/vlc/." "$DEST/include/vlc/"
fi
cp -R "$GL_HEADERS/." "$DEST/include/"
cp -R "$WORK/device/lib/." "$DEST/lib/"
cp "$VLC_SOURCE/COPYING" "$DEST/licenses/VLC-COPYING"
cp "$FFMPEG_SOURCE/COPYING.LGPLv3" "$DEST/licenses/FFmpeg-COPYING.LGPLv3"
if [[ -f /tmp/openssl-openssl-3.5.9/LICENSE.txt ]]; then
  cp /tmp/openssl-openssl-3.5.9/LICENSE.txt "$DEST/licenses/OpenSSL-LICENSE.txt"
fi
echo "Prepared native VLC inputs in $DEST"
