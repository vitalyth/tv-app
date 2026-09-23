import { StyleSheet, View } from 'react-native';
import { useMediaController } from '../media/MediaController';
import { MediaSurface } from '../media/MediaSurface';
import { RemoteImage } from './RemoteImage';

export function MediaLayer() {
  const { item, stream, presentation, status, markError, markPlaying } =
    useMediaController();

  return (
    <View
      pointerEvents="none"
      style={styles.layer}
      testID="persistent-media-layer"
    >
      {item && stream && presentation !== 'background-image' ? (
        <MediaSurface
          streamUrl={stream.url}
          streamType={stream.type}
          fallbackStreamUrl={stream.fallbackUrl}
          fallbackStreamType={stream.fallbackType}
          onFirstFrame={markPlaying}
          onError={markError}
        />
      ) : (
        <>
          <View style={styles.light} />
          <View style={styles.horizon} />
        </>
      )}
      {(item?.backdropUrl || item?.imageUrl) &&
      (presentation === 'background-image' || status !== 'playing') ? (
        <RemoteImage
          uri={item.backdropUrl ?? item.imageUrl!}
          fallbackUri={item.fallbackImageUrl}
          resizeMode="cover"
          style={styles.poster}
        />
      ) : null}
      <View style={styles.scrim} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111b25',
    overflow: 'hidden',
  },
  light: {
    position: 'absolute',
    right: -80,
    top: -120,
    width: '58%',
    height: '78%',
    borderRadius: 320,
    backgroundColor: '#294d60',
    opacity: 0.5,
  },
  horizon: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: '46%',
    backgroundColor: '#12232e',
  },
  poster: { ...StyleSheet.absoluteFillObject },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 8, 14, 0.48)',
  },
});
