package com.brentvatne.exoplayer;

import android.content.Context;
import android.os.Build;
import android.os.Handler;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.Renderer;
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.video.MediaCodecVideoRenderer;
import androidx.media3.exoplayer.video.VideoRendererEventListener;
import java.util.ArrayList;

/** Keep Sony's software AVC codec on its original surface until it is released. */
public final class TvAppRenderersFactory extends DefaultRenderersFactory {
    public TvAppRenderersFactory(Context context) {
        super(context);
    }

    @Override
    protected void buildVideoRenderers(
            Context context, int extensionRendererMode, MediaCodecSelector selector,
            boolean enableDecoderFallback, Handler eventHandler,
            VideoRendererEventListener eventListener, long allowedJoiningTimeMs,
            ArrayList<Renderer> out) {
        if (!"Sony".equalsIgnoreCase(Build.MANUFACTURER) || Build.VERSION.SDK_INT != 31
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
