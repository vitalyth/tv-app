import React from 'react';
import { View, StyleSheet } from 'react-native';

interface ProgressBarProps {
  progress: number; // 0 to 1
  color?: string;
  height?: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = React.memo(({
  progress,
  color = '#25D4DE',
  height = 4,
}) => {
  const norm = progress > 1 ? progress / 100 : (progress || 0);
  const clamped = Math.max(0.04, Math.min(1, norm));

  return (
    <View style={[styles.track, { height }]}>
      <View
        style={[
          styles.fill,
          { width: `${clamped * 100}%`, backgroundColor: color, height },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});

export default ProgressBar;
