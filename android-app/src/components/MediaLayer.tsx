import { StyleSheet, View } from 'react-native';

export function MediaLayer() {
  return (
    <View
      pointerEvents="none"
      style={styles.layer}
      testID="persistent-media-layer"
    >
      <View style={styles.light} />
      <View style={styles.horizon} />
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
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 8, 14, 0.48)',
  },
});
