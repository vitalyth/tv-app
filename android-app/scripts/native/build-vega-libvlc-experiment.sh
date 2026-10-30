#!/usr/bin/env bash
# Isolated software-decoding experiment, not a production player build.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PRIVATE="$ROOT/platforms/vega/packages/vega-user-engagement/build/private"
ARCH=${ARCH:-armv7}
case "$ARCH" in
  armv7)
    TRIPLE=armv7a-linux-gnueabihf
    VLC_HOST=arm-linux-gnueabihf
    CPU_FLAGS="-mcpu=cortex-a7 -mthumb -mfpu=neon-vfpv4"
    DYNAMIC_LINKER=/lib/ld-linux-armhf.so.3
    OPENSSL_TARGET=linux-armv4
    FFMPEG_ARCH_OPTIONS=(--arch=arm --cpu=cortex-a7)
    ;;
  x86_64)
    TRIPLE=x86_64-unknown-linux-gnu
    VLC_HOST=x86_64-linux-gnu
    CPU_FLAGS="-msse2"
    DYNAMIC_LINKER=/lib64/ld-linux-x86-64.so.2
    OPENSSL_TARGET=linux-x86_64
    FFMPEG_ARCH_OPTIONS=(--arch=x86_64 --disable-x86asm)
    ;;
  *) echo "Unsupported Vega architecture: $ARCH" >&2; exit 2 ;;
esac
TOOLCHAIN="$PRIVATE/toolchain/$ARCH/mac"
SYSROOT="$PRIVATE/sysroot-$ARCH"
RESOURCE_DIR="$TOOLCHAIN/$ARCH/lib/clang/15.0.6"
if [[ "$ARCH" == armv7 ]]; then
  WORK=${WORK:-/tmp/tv-vega-libvlc}
else
  WORK=${WORK:-/tmp/tv-vega-libvlc-$ARCH}
fi
VLC_REVISION=${VLC_REVISION:-99f4e71f10d28ef73bc6157672622ebb90e2f577}
VLC_SOURCE=${VLC_SOURCE:-/tmp/vlc-$VLC_REVISION}
FFMPEG_SOURCE=${FFMPEG_SOURCE:-/tmp/FFmpeg-n7.1.1}
PREFIX="$WORK/install"
LIVE=${LIVE:-0}
export PATH="$TOOLCHAIN/bin:$PATH"
export CC="$TOOLCHAIN/bin/$TRIPLE-clang"
export CXX="$TOOLCHAIN/bin/$TRIPLE-clang++"
export AR="$TOOLCHAIN/bin/llvm-ar"
export RANLIB="$TOOLCHAIN/bin/llvm-ranlib"
export NM="$TOOLCHAIN/bin/llvm-nm"
export STRIP="$TOOLCHAIN/bin/llvm-strip"
export OBJCOPY="$TOOLCHAIN/bin/llvm-objcopy"
export LD="$TOOLCHAIN/bin/ld.lld"
export BUILDCC=/usr/bin/clang
export CFLAGS="--sysroot=$SYSROOT -resource-dir=$RESOURCE_DIR $CPU_FLAGS -O2 -fPIC"
export CXXFLAGS="$CFLAGS -stdlib=libc++"
export LDFLAGS="$CFLAGS -fuse-ld=lld -Wl,--dynamic-linker=$DYNAMIC_LINKER"
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig"
export PKG_CONFIG_PATH=
mkdir -p "$WORK/ffmpeg" "$WORK/vlc" "$PREFIX"

FFMPEG_LIVE_OPTIONS=()
VLC_FORMAT_OPTION=--disable-avformat
if [[ "$LIVE" == 1 ]]; then
  SONAME_PATCH="$ROOT/scripts/native/vlc-private-soname.patch"
  if patch --dry-run --forward -d "$VLC_SOURCE" -p1 < "$SONAME_PATCH" >/dev/null 2>&1; then
    patch --forward -d "$VLC_SOURCE" -p1 < "$SONAME_PATCH"
  else
    patch --dry-run --reverse -d "$VLC_SOURCE" -p1 < "$SONAME_PATCH" >/dev/null
  fi
  TLS_PATCH="$ROOT/scripts/native/ffmpeg-vega-tls.patch"
  if patch --dry-run --forward -d "$FFMPEG_SOURCE" -p1 < "$TLS_PATCH" >/dev/null 2>&1; then
    patch --forward -d "$FFMPEG_SOURCE" -p1 < "$TLS_PATCH"
  else
    patch --dry-run --reverse -d "$FFMPEG_SOURCE" -p1 < "$TLS_PATCH" >/dev/null
  fi
  AVIO_PATCH="$ROOT/scripts/native/vlc-avio-http.patch"
  if patch --dry-run --forward -d "$VLC_SOURCE" -p1 < "$AVIO_PATCH" >/dev/null 2>&1; then
    patch --forward -d "$VLC_SOURCE" -p1 < "$AVIO_PATCH"
  else
    patch --dry-run --reverse -d "$VLC_SOURCE" -p1 < "$AVIO_PATCH" >/dev/null
  fi
  OPENSSL_SOURCE=${OPENSSL_SOURCE:-/tmp/openssl-openssl-3.5.9}
  OPENSSL_PREFIX="$WORK/openssl-install"
  mkdir -p "$WORK/openssl"
  pushd "$WORK/openssl" >/dev/null
  if [[ ! -f Makefile ]]; then
    perl "$OPENSSL_SOURCE/Configure" "$OPENSSL_TARGET" no-shared no-asm no-tests \
      no-docs no-apps no-module no-legacy no-quic \
      --prefix="$OPENSSL_PREFIX" --openssldir=/etc/ssl --libdir=lib
  fi
  make -j4 build_libs
  make install_dev
  popd >/dev/null
  export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig:$OPENSSL_PREFIX/lib/pkgconfig"
  export PKG_CONFIG="pkg-config --static"
  FFMPEG_LIVE_OPTIONS+=(--enable-version3 --enable-openssl --enable-network \
    --enable-demuxer=hls,mov,mpegts,aac --enable-parser=aac \
    --enable-protocol=file,http,https,tcp,tls,crypto \
    --enable-bsf=aac_adtstoasc,h264_mp4toannexb)
  VLC_FORMAT_OPTION=--enable-avformat
fi

if [[ ! -x "$CC" || ! -x "$VLC_SOURCE/configure" || ! -x "$FFMPEG_SOURCE/configure" ]]; then
  echo "Prepare the Vega native toolchain and bootstrapped sources first; see docs/libvlc-vega-investigation.md." >&2
  exit 2
fi
# GitHub archives lack the revision metadata normally supplied by git/export.
if [[ ! -d "$VLC_SOURCE/.git" && ! -f "$VLC_SOURCE/src/revision.txt" ]]; then
  printf '%s\n' "$VLC_REVISION" > "$VLC_SOURCE/src/revision.txt"
fi

PATCH="$ROOT/scripts/native/ffmpeg-7.1.1-h264-only.patch"
if patch --dry-run --forward -d "$FFMPEG_SOURCE" -p1 < "$PATCH" >/dev/null 2>&1; then
  patch --forward -d "$FFMPEG_SOURCE" -p1 < "$PATCH"
else
  patch --dry-run --reverse -d "$FFMPEG_SOURCE" -p1 < "$PATCH" >/dev/null
fi

cd "$WORK/ffmpeg"
if [[ ! -f ffbuild/config.mak ]]; then
  "$FFMPEG_SOURCE/configure" --prefix="$PREFIX" --enable-cross-compile \
    --target-os=linux "${FFMPEG_ARCH_OPTIONS[@]}" --cc="$CC" --cxx="$CXX" \
    --ar="$AR" --ranlib="$RANLIB" --nm="$NM" --strip="$STRIP" \
    --sysroot="$SYSROOT" --extra-cflags="$CFLAGS" --extra-ldflags="$LDFLAGS" \
    --disable-everything --disable-programs --disable-doc --disable-debug \
    --disable-autodetect --disable-shared --enable-static --enable-pic \
    --enable-avcodec --enable-avutil --enable-swscale \
    --enable-decoder=h264 --enable-parser=h264 "${FFMPEG_LIVE_OPTIONS[@]}"
fi
make -j4
make install

cd "$WORK/vlc"
if [[ ! -f Makefile || ${RECONFIGURE:-0} == 1 ]]; then
  "$VLC_SOURCE/configure" --host="$VLC_HOST" --build=x86_64-apple-darwin \
    --prefix="$PREFIX" --with-gnu-ld --disable-vlc --disable-nls --disable-lua \
    --disable-rust --disable-qt --disable-skins2 --disable-dbus \
    --disable-sout --disable-vlm --disable-live555 --disable-dvdread \
    --disable-dvdnav --disable-bluray "$VLC_FORMAT_OPTION" --disable-postproc \
    --disable-mad --disable-faad --disable-vpx \
    --disable-x264 --disable-x265 --disable-libva --disable-vdpau \
    --disable-xcb --disable-wayland --disable-gl --disable-gles2 \
    --disable-libplacebo --disable-vulkan --disable-freetype --disable-fribidi \
    --disable-harfbuzz --disable-libass --disable-pulse --disable-alsa \
    --disable-jack --disable-pipewire --disable-sndio --disable-chromecast \
    --disable-libgcrypt --disable-gnutls --disable-taglib --disable-notify \
    --disable-update-check --disable-udev --disable-ncurses \
    --enable-avcodec --enable-swscale
fi
# libtool drops unrecognized -resource-dir unless explicitly forwarded.
MAKE_LINK_FLAGS="$LDFLAGS -Wl,-z,defs -Wl,--disable-new-dtags -Xcompiler -resource-dir=$RESOURCE_DIR"
make -C compat -j4 LDFLAGS="$MAKE_LINK_FLAGS"
make -C src -j4 LDFLAGS="$MAKE_LINK_FLAGS"
make -C lib -j4 LDFLAGS="$MAKE_LINK_FLAGS"
PLUGINS=(filesystem mp4 packetizer_h264 avcodec swscale vmem wdummy console_logger)
if [[ "$LIVE" == 1 ]]; then
  PLUGINS+=(avio avformat)
fi
TARGETS=()
for plugin in "${PLUGINS[@]}"; do
  TARGETS+=("lib${plugin}_plugin.la")
done
make -C modules -j4 LDFLAGS="$MAKE_LINK_FLAGS" "${TARGETS[@]}"

BUNDLE="$WORK/device"
mkdir -p "$BUNDLE/lib/plugins"
cp -L src/.libs/libvlccore.so* lib/.libs/libvlc.so* "$BUNDLE/lib/"
for plugin in "${PLUGINS[@]}"; do
  cp "modules/.libs/lib${plugin}_plugin.so" "$BUNDLE/lib/plugins/"
done

# Match headers and ABI to this exact libVLC build, not a system VLC SDK.
EXTRA_SOURCE=()
if [[ ${GPU_OUTPUT:-0} == 1 ]]; then
  if [[ ${OUTPUT_I420:-0} != 1 ]]; then
    echo "GPU_OUTPUT=1 requires OUTPUT_I420=1" >&2
    exit 2
  fi
  EXTRA_SOURCE+=("$ROOT/scripts/native/vega-yuv-renderer.c")
fi
"$CC" $CFLAGS $LDFLAGS -Wall -Wextra -Werror \
  -DFRAME_WIDTH="${FRAME_WIDTH:-160}" -DFRAME_HEIGHT="${FRAME_HEIGHT:-90}" \
  -DOUTPUT_I420="${OUTPUT_I420:-0}" \
  -DGPU_OUTPUT="${GPU_OUTPUT:-0}" -I"${GL_HEADERS:-/tmp/tv-vega-gl-headers}" \
  -I"$VLC_SOURCE/include" -I"$WORK/vlc/include" \
  "$ROOT/scripts/native/vega-libvlc-decode-test.c" "${EXTRA_SOURCE[@]}" \
  -L"$BUNDLE/lib" -Wl,-rpath,'$ORIGIN/lib' -lvlc -pthread -ldl \
  -o "$BUNDLE/vega-libvlc-decode-test"
