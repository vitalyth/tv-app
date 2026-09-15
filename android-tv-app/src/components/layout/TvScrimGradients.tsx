import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

const scrimComposite = require('../../assets/scrim_composite.png');

/**
 * Composite hardware-filtered scrim gradient layer matching native TvScreenLayout.kt 1:1.
 * - Top-right video region (x > 58%, y < 38%) is 100% transparent, bright, and vibrant.
 * - Left side has a smooth cubic fade covering the side navigation rail and hero text.
 * - Bottom has a smooth cubic fade covering the episodes and cards rows.
 */
export const TvScrimGradients: React.FC = React.memo(() => {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={scrimComposite}
        style={StyleSheet.absoluteFill}
        resizeMode="stretch"
      />
    </View>
  );
});

export default TvScrimGradients;
