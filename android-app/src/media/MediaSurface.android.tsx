import Video, {
  type OnProgressData,
  type OnVideoTracksData,
  SelectedVideoTrackType,
  type SelectedVideoTrack,
} from 'react-native-video';
import { StyleSheet } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaSurfaceProps } from './MediaSurface.types';
import type { VideoQualityOption } from './player';

export function MediaSurface({
  streamUrl,
  streamType,
  fallbackStreamUrl,
  fallbackStreamType,
  isMuted = false,
  paused = false,
  startPositionSeconds,
  selectedQualityId = 'auto',
  registerSeekHandler,
  style,
  onFirstFrame,
  onError,
  onProgress,
  onVideoTracks,
}: MediaSurfaceProps) {
  const videoRef = useRef<any>(null);
  const [activeSource, setActiveSource] = useState({
    url: streamUrl,
    type: streamType || 'm3u8',
  });
  const usingFallback = useRef(false);
  const firstFrameReported = useRef(false);

  useEffect(() => {
    return registerSeekHandler?.(seconds => videoRef.current?.seek(seconds));
  }, [registerSeekHandler]);

  useEffect(() => {
    usingFallback.current = false;
    firstFrameReported.current = false;
    setActiveSource({ url: streamUrl, type: streamType || 'm3u8' });
  }, [streamType, streamUrl]);

  const handleFirstFrame = useCallback(() => {
    if (!firstFrameReported.current) {
      firstFrameReported.current = true;
      onFirstFrame();
    }
  }, [onFirstFrame]);

  const handleProgress = useCallback(
    (data: OnProgressData) => {
      if (data.currentTime > 0) {
        handleFirstFrame();
      }
      onProgress?.({
        currentTime: data.currentTime,
        playableDuration: data.playableDuration,
        seekableDuration: data.seekableDuration,
      });
    },
    [handleFirstFrame, onProgress],
  );

  const handleVideoTracks = useCallback(
    (data: OnVideoTracksData) => {
      if (!data.videoTracks || data.videoTracks.length === 0) {
        return;
      }
      const seenHeights = new Set<number>();
      const trackOptions: VideoQualityOption[] = [
        {
          id: 'auto',
          label: 'Auto (HD)',
          active: selectedQualityId === 'auto',
        },
      ];

      const sortedTracks = [...data.videoTracks]
        .filter(t => typeof t.height === 'number' && t.height > 0)
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

      for (const track of sortedTracks) {
        const h = track.height!;
        if (!seenHeights.has(h)) {
          seenHeights.add(h);
          trackOptions.push({
            id: String(h),
            label: `${h}p`,
            height: h,
            width: track.width,
            bitrate: track.bitrate,
            active: selectedQualityId === String(h),
          });
        }
      }

      onVideoTracks?.(trackOptions);
    },
    [onVideoTracks, selectedQualityId],
  );

  const handleError = useCallback(() => {
    if (fallbackStreamUrl && !usingFallback.current) {
      usingFallback.current = true;
      setActiveSource({
        url: fallbackStreamUrl,
        type: fallbackStreamType || 'm3u8',
      });
      return;
    }
    onError();
  }, [fallbackStreamType, fallbackStreamUrl, onError]);

  const selectedVideoTrack = useMemo<SelectedVideoTrack>(() => {
    if (!selectedQualityId || selectedQualityId === 'auto') {
      return { type: SelectedVideoTrackType.AUTO };
    }
    const height = Number(selectedQualityId);
    if (!Number.isNaN(height) && height > 0) {
      return {
        type: SelectedVideoTrackType.RESOLUTION,
        value: height,
      };
    }
    return { type: SelectedVideoTrackType.AUTO };
  }, [selectedQualityId]);

  return (
    <Video
      ref={videoRef}
      key={activeSource.url}
      source={{ uri: activeSource.url, type: activeSource.type || 'm3u8' }}
      style={[styles.surface, style]}
      resizeMode="cover"
      paused={paused}
      controls={false}
      muted={isMuted}
      volume={1.0}
      repeat={true}
      useTextureView={true}
      shutterColor="transparent"
      playInBackground={false}
      playWhenInactive={false}
      ignoreSilentSwitch="ignore"
      onReadyForDisplay={handleFirstFrame}
      onLoad={() => {
        if (startPositionSeconds && startPositionSeconds > 0) {
          videoRef.current?.seek(startPositionSeconds);
        }
        handleFirstFrame();
      }}
      onPlaybackStateChanged={({ isPlaying }) => {
        if (isPlaying) {
          handleFirstFrame();
        }
      }}
      onProgress={handleProgress}
      onVideoTracks={handleVideoTracks}
      selectedVideoTrack={selectedVideoTrack}
      onError={handleError}
      bufferConfig={{
        minBufferMs: 2500,
        maxBufferMs: 8000,
        bufferForPlaybackMs: 750,
        bufferForPlaybackAfterRebufferMs: 1500,
      }}
    />
  );
}

const styles = StyleSheet.create({
  surface: StyleSheet.absoluteFillObject,
});
