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

const bufferConfig = {
  minBufferMs: 2500,
  maxBufferMs: 8000,
  bufferForPlaybackMs: 750,
  bufferForPlaybackAfterRebufferMs: 1500,
};

export function MediaSurface({
  streamUrl,
  streamType,
  fallbackStreamUrl,
  fallbackStreamType,
  isLive = false,
  isMuted = false,
  disableAudioFocus = false,
  maxVideoHeight,
  maxBitRate,
  resizeMode = 'cover',
  paused = false,
  startPositionSeconds,
  selectedQualityId = 'auto',
  registerSeekHandler,
  style,
  onFirstFrame,
  onError,
  onBuffer,
  onPlaybackStateChanged,
  onEnd,
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
  const seekableEndRef = useRef<number | undefined>(undefined);
  const currentPositionRef = useRef(startPositionSeconds ?? 0);
  const pendingResumeRef = useRef(startPositionSeconds ?? 0);
  const fallbackPositionRef = useRef<number | undefined>(undefined);
  const [trackHeights, setTrackHeights] = useState<number[]>([]);

  useEffect(() => {
    return registerSeekHandler?.(seconds => {
      if (!Number.isFinite(seconds) || seconds < 0) {
        return;
      }
      if (isLive) {
        const end = seekableEndRef.current;
        if (end === undefined) {
          return;
        }
        videoRef.current?.seek(Math.min(seconds, end - Math.min(3, end / 2)));
      } else {
        currentPositionRef.current = seconds;
        pendingResumeRef.current = 0;
        videoRef.current?.seek(seconds);
      }
    });
  }, [isLive, registerSeekHandler]);

  useEffect(() => {
    usingFallback.current = false;
    firstFrameReported.current = false;
    seekableEndRef.current = undefined;
    currentPositionRef.current = startPositionSeconds ?? 0;
    pendingResumeRef.current = startPositionSeconds ?? 0;
    fallbackPositionRef.current = undefined;
    setTrackHeights([]);
    setActiveSource({ url: streamUrl, type: streamType || 'm3u8' });
  }, [streamType, streamUrl]);

  useEffect(() => {
    if (maxVideoHeight && trackHeights.length && trackHeights.every(height => height > 1080)) {
      onError();
    }
  }, [maxVideoHeight, trackHeights, onError]);

  const handleFirstFrame = useCallback(() => {
    if (!firstFrameReported.current) {
      firstFrameReported.current = true;
      onFirstFrame();
    }
  }, [onFirstFrame]);

  const handleProgress = useCallback(
    (data: OnProgressData) => {
      const hasRange =
        Number.isFinite(data.seekableDuration) && data.seekableDuration > 0;
      seekableEndRef.current = hasRange ? data.seekableDuration : undefined;
      if (Number.isFinite(data.currentTime) && data.currentTime >= 0 &&
          data.currentTime >= pendingResumeRef.current - 2) {
        currentPositionRef.current = data.currentTime;
        pendingResumeRef.current = 0;
      }
      if (data.currentTime > 0) {
        handleFirstFrame();
      }
      onProgress?.({
        currentTime: data.currentTime,
        playableDuration: data.playableDuration,
        seekableDuration: hasRange ? data.seekableDuration : 0,
        seekableStart: hasRange ? 0 : undefined,
        seekableEnd: seekableEndRef.current,
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
      const heights = [...new Set(data.videoTracks
        .map(track => track.height ?? 0)
        .filter(height => height > 0))].sort((a, b) => a - b);
      setTrackHeights(previous =>
        previous.length === heights.length && previous.every((height, index) => height === heights[index])
          ? previous : heights,
      );
      const trackOptions: VideoQualityOption[] = [
        {
          id: 'auto',
          label: 'Auto',
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
      fallbackPositionRef.current = isLive ? undefined : currentPositionRef.current;
      pendingResumeRef.current = isLive ? 0 : currentPositionRef.current;
      seekableEndRef.current = undefined;
      setActiveSource({
        url: fallbackStreamUrl,
        type: fallbackStreamType || 'm3u8',
      });
      return;
    }
    onError();
  }, [fallbackStreamType, fallbackStreamUrl, isLive, onError]);

  const selectedVideoTrack = useMemo<SelectedVideoTrack>(() => {
    if (maxVideoHeight && trackHeights.length) {
      const allowed = trackHeights.filter(height => height <= maxVideoHeight);
      return {
        type: SelectedVideoTrackType.RESOLUTION,
        value: allowed.length
          ? Math.max(...allowed)
          : Math.min(...trackHeights),
      };
    }
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
  }, [maxVideoHeight, selectedQualityId, trackHeights]);

  const source = useMemo(() => ({
    uri: activeSource.url, type: activeSource.type || 'm3u8',
  }), [activeSource.url, activeSource.type]);

  return (
    <Video
      ref={videoRef}
      key={activeSource.url}
      source={source}
      style={[styles.surface, style]}
      resizeMode={resizeMode}
      paused={paused}
      controls={false}
      muted={isMuted}
      disableFocus={disableAudioFocus}
      volume={1.0}
      maxBitRate={maxBitRate}
      repeat={isLive}
      // Keep a TextureView throughout playback so native scale/translation
      // animations remain smooth without replacing the video surface.
      useTextureView={true}
      shutterColor="transparent"
      playInBackground={false}
      playWhenInactive={false}
      ignoreSilentSwitch="ignore"
      onReadyForDisplay={handleFirstFrame}
      onLoad={() => {
        const position = fallbackPositionRef.current ?? startPositionSeconds;
        if (!isLive && position && position > 0) {
          videoRef.current?.seek(position);
        }
        handleFirstFrame();
      }}
      onPlaybackStateChanged={state => {
        onPlaybackStateChanged?.(state);
        if (state.isPlaying) {
          handleFirstFrame();
        }
      }}
      progressUpdateInterval={maxVideoHeight ? 1000 : 250}
      onProgress={handleProgress}
      onVideoTracks={handleVideoTracks}
      selectedVideoTrack={selectedVideoTrack}
      onError={handleError}
      onBuffer={({isBuffering}) => onBuffer?.(isBuffering)}
      onEnd={onEnd}
      bufferConfig={bufferConfig}
    />
  );
}

const styles = StyleSheet.create({
  surface: StyleSheet.absoluteFillObject,
});
