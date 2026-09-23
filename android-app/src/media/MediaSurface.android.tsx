import Video, { type OnProgressData, ViewType } from 'react-native-video';
import { StyleSheet } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import type { MediaSurfaceProps } from './MediaSurface.types';

export function MediaSurface({
  streamUrl,
  streamType,
  fallbackStreamUrl,
  fallbackStreamType,
  onFirstFrame,
  onError,
}: MediaSurfaceProps) {
  const [activeSource, setActiveSource] = useState({
    url: streamUrl,
    type: streamType,
  });
  const usingFallback = useRef(false);
  const firstFrameReported = useRef(false);

  useEffect(() => {
    usingFallback.current = false;
    firstFrameReported.current = false;
    setActiveSource({ url: streamUrl, type: streamType });
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
      setActiveSource({ url: fallbackStreamUrl, type: fallbackStreamType });
      return;
    }
    onError();
  };

  return (
    <Video
      key={activeSource.url}
      source={{ uri: activeSource.url, type: activeSource.type }}
      style={styles.surface}
      resizeMode="cover"
      viewType={ViewType.TEXTURE}
      paused={false}
      controls={false}
      onReadyForDisplay={handleFirstFrame}
      onProgress={handleProgress}
      onError={handleError}
    />
  );
}

const styles = StyleSheet.create({
  surface: StyleSheet.absoluteFillObject,
});
