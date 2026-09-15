import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Video from 'react-native-video';
import { getStreamType } from '../../utils/stream';

interface TvInlinePlayerProps {
  streamUrl?: string | null;
  visible: boolean;
  isMuted?: boolean;
}

export const TvInlinePlayer: React.FC<TvInlinePlayerProps> = React.memo(({
  streamUrl,
  visible,
  isMuted = false,
}) => {
  const [debouncedStreamUrl, setDebouncedStreamUrl] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    // 1. Immediately reset state so previous video stops and image is displayed instantly
    setDebouncedStreamUrl(null);
    setIsVideoReady(false);

    if (!visible || !streamUrl) {
      return;
    }

    // 2. Wait 2 seconds (2000ms) of sustained focus before activating background video
    const timer = setTimeout(() => {
      setDebouncedStreamUrl(streamUrl);
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [streamUrl, visible]);

  if (!visible || !debouncedStreamUrl) {
    return null;
  }

  const streamType = getStreamType(debouncedStreamUrl);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Video
        source={{
          uri: debouncedStreamUrl,
          type: streamType,
        }}
        style={[
          StyleSheet.absoluteFill,
          { opacity: isVideoReady ? 1 : 0 },
        ]}
        resizeMode="cover"
        muted={isMuted}
        repeat
        playInBackground={false}
        playWhenInactive={false}
        ignoreSilentSwitch="ignore"
        onReadyForDisplay={() => setIsVideoReady(true)}
        bufferConfig={{
          minBufferMs: 2500,
          maxBufferMs: 8000,
          bufferForPlaybackMs: 750,
          bufferForPlaybackAfterRebufferMs: 1500,
        }}
      />
    </View>
  );
});

export default TvInlinePlayer;
