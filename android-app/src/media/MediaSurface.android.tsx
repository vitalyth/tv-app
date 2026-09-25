import Video, { type OnProgressData } from 'react-native-video';
import { StyleSheet } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import type { MediaSurfaceProps } from './MediaSurface.types';

export function MediaSurface({
  streamUrl,
  streamType,
  fallbackStreamUrl,
  fallbackStreamType,
  isMuted = false,
  style,
  onFirstFrame,
  onError,
}: MediaSurfaceProps) {
  const [activeSource, setActiveSource] = useState({
    url: streamUrl,
    type: streamType || 'm3u8',
  });
  const usingFallback = useRef(false);
  const firstFrameReported = useRef(false);

  useEffect(() => {
    usingFallback.current = false;
    firstFrameReported.current = false;
    setActiveSource({ url: streamUrl, type: streamType || 'm3u8' });
  }, [streamType, streamUrl]);

  const handleFirstFrame = () => {
    if (!firstFrameReported.current) {
      firstFrameReported.current = true;
      onFirstFrame();
    }
  };

  const handleProgress = ({ currentTime }: OnProgressData) => {
    if (currentTime > 0) {
      handleFirstFrame();
    }
  };

  const handleError = () => {
    if (fallbackStreamUrl && !usingFallback.current) {
      usingFallback.current = true;
      setActiveSource({
        url: fallbackStreamUrl,
        type: fallbackStreamType || 'm3u8',
      });
      return;
    }
    onError();
  };

  return (
    <Video
      key={activeSource.url}
      source={{ uri: activeSource.url, type: activeSource.type || 'm3u8' }}
      style={[styles.surface, style]}
      resizeMode="cover"
      paused={false}
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
      onLoad={handleFirstFrame}
      onPlaybackStateChanged={({ isPlaying }) => {
        if (isPlaying) {
          handleFirstFrame();
        }
      }}
      onProgress={handleProgress}
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
