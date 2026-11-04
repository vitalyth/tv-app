package com.brentvatne.exoplayer;

import android.content.Context;
import android.os.Build;
import android.os.Handler;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.common.Format;
import androidx.media3.common.MimeTypes;
import androidx.media3.exoplayer.Renderer;
import androidx.media3.exoplayer.mediacodec.MediaCodecInfo;
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil;
import androidx.media3.exoplayer.video.MediaCodecVideoRenderer;
import androidx.media3.exoplayer.video.VideoRendererEventListener;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.concurrent.atomic.AtomicInteger;

/** Balance dense Sony grids and safely release Sony's software AVC surfaces. */
public final class TvAppRenderersFactory extends DefaultRenderersFactory {
    // Matches MULTIVIEW_MAX_BITRATE in src/media/player.ts. One/two Android
    // tiles use twice this budget and retain normal hardware-first selection.
    private static final int DENSE_GRID_BITRATE_LIMIT = 260000;
    private static final AtomicInteger softwareReservations = new AtomicInteger();
    private final BooleanSupplier tileMode;

    public TvAppRenderersFactory(Context context, BooleanSupplier tileMode) {
        super(context);
        this.tileMode = tileMode;
    }

    public static boolean isAffectedBravia() {
        return "Sony".equalsIgnoreCase(Build.MANUFACTURER) && Build.VERSION.SDK_INT == 31;
    }

    public static boolean isDenseTileBitrate(int bitrate) {
        return bitrate > 0 && bitrate <= DENSE_GRID_BITRATE_LIMIT;
    }

    public static boolean isLightweightAvc(Format format) {
        return format != null && MimeTypes.VIDEO_H264.equals(format.sampleMimeType)
                && format.width > 0 && format.width <= 1280
                && format.height > 0 && format.height <= 720;
    }

    @Override
    protected void buildVideoRenderers(
            Context context, int extensionRendererMode, MediaCodecSelector selector,
            boolean enableDecoderFallback, Handler eventHandler,
            VideoRendererEventListener eventListener, long allowedJoiningTimeMs,
            ArrayList<Renderer> out) {
        if (!isAffectedBravia()
                || extensionRendererMode != EXTENSION_RENDERER_MODE_OFF) {
            super.buildVideoRenderers(context, extensionRendererMode, selector,
                    enableDecoderFallback, eventHandler, eventListener, allowedJoiningTimeMs, out);
            return;
        }
        MediaCodecVideoRenderer.Builder builder = new MediaCodecVideoRenderer.Builder(context)
                .setCodecAdapterFactory(getCodecAdapterFactory())
                .setMediaCodecSelector(selector)
                .setAllowedJoiningTimeMs(allowedJoiningTimeMs)
                .setEnableDecoderFallback(enableDecoderFallback)
                .setEventHandler(eventHandler)
                .setEventListener(eventListener)
                .setMaxDroppedFramesToNotify(MAX_DROPPED_VIDEO_FRAME_COUNT_TO_NOTIFY);
        out.add(new MediaCodecVideoRenderer(builder) {
            private boolean softwareReserved;

            private void releaseSoftwareReservation() {
                if (softwareReserved) {
                    softwareReserved = false;
                    softwareReservations.decrementAndGet();
                }
            }

            @Override
            protected void onDisabled() {
                try {
                    super.onDisabled();
                } finally {
                    releaseSoftwareReservation();
                }
            }

            @Override
            protected void onReset() {
                try {
                    super.onReset();
                } finally {
                    releaseSoftwareReservation();
                }
            }

            @Override
            protected List<MediaCodecInfo> getDecoderInfos(MediaCodecSelector codecSelector,
                    Format format, boolean requiresSecureDecoder)
                    throws MediaCodecUtil.DecoderQueryException {
                List<MediaCodecInfo> infos = super.getDecoderInfos(codecSelector, format, requiresSecureDecoder);
                boolean preferSoftware = tileMode.getAsBoolean() && !requiresSecureDecoder
                        && isLightweightAvc(format) && infos.stream().anyMatch(info -> info.softwareOnly);
                if (!preferSoftware) releaseSoftwareReservation();
                if (preferSoftware && !softwareReserved) {
                    softwareReserved = softwareReservations.getAndUpdate(value -> Math.min(2, value + 1)) < 2;
                }
                if (preferSoftware && softwareReserved) {
                    infos = new ArrayList<>(infos);
                    // This TV has two hardware AVC instances. Decode small tiles in
                    // software first so HD-only tiles can use the hardware slots.
                    // Keep the hardware decoders as fallback, never exclude them.
                    infos.sort(Comparator.comparing(info -> !info.softwareOnly));
                    android.util.Log.d("TvAppCodec", "Prefer software for tile "
                            + format.width + "x" + format.height);
                }
                return infos;
            }

            @Override
            protected boolean codecNeedsSetOutputSurfaceWorkaround(String name) {
                // Detaching a TextureView normally switches the live decoder to a tiny
                // PlaceholderSurface. Sony's Android 12 software AVC decoder can crash
                // in format conversion during that switch. Release it instead.
                if ("c2.android.avc.decoder".equals(name)) {
                    android.util.Log.d("TvAppCodec", "Using safe software AVC surface release");
                    return true;
                }
                return super.codecNeedsSetOutputSurfaceWorkaround(name);
            }
        });
    }
}
