import React from 'react';
import { View, StyleSheet } from 'react-native';

interface AppLogoProps {
  size?: number;
}

export const AppLogo: React.FC<AppLogoProps> = React.memo(({ size = 96 }) => {
  const scale = size / 96;
  const borderRadius = 20 * scale;
  const borderWidth = Math.max(2.5, 3.5 * scale);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
        },
      ]}
    >
      {/* Antennas */}
      <View style={styles.antennaBox}>
        <View
          style={[
            styles.antennaLeft,
            {
              width: 13 * scale,
              height: 3 * scale,
              borderRadius: 1.5 * scale,
            },
          ]}
        />
        <View
          style={[
            styles.antennaRight,
            {
              width: 13 * scale,
              height: 3 * scale,
              borderRadius: 1.5 * scale,
            },
          ]}
        />
      </View>

      {/* TV Screen Box */}
      <View
        style={[
          styles.tvBody,
          {
            width: 46 * scale,
            height: 32 * scale,
            borderWidth,
            borderRadius: 7 * scale,
            marginTop: 2 * scale,
          },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E91E2F',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  antennaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  antennaLeft: {
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '-35deg' }, { translateX: 2 }],
  },
  antennaRight: {
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '35deg' }, { translateX: -2 }],
  },
  tvBody: {
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
});

export default AppLogo;
