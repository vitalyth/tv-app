import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';

export type TvIconType = 'home' | 'live' | 'vod' | 'fullscreen' | 'volume-up' | 'volume-off' | 'play' | 'back';

interface TvIconProps {
  name: TvIconType;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const TvIcon: React.FC<TvIconProps> = ({
  name,
  size = 20,
  color = '#FFFFFF',
  style,
}) => {
  const s = size;

  switch (name) {
    case 'home':
      return (
        <View style={[{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }, style]}>
          {/* Roof triangle */}
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: s * 0.46,
              borderRightWidth: s * 0.46,
              borderBottomWidth: s * 0.38,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: color,
            }}
          />
          {/* House body */}
          <View
            style={{
              width: s * 0.68,
              height: s * 0.44,
              backgroundColor: color,
              borderBottomLeftRadius: 1.5,
              borderBottomRightRadius: 1.5,
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            {/* Door cut-out */}
            <View
              style={{
                width: s * 0.24,
                height: s * 0.26,
                backgroundColor: '#0A0E14',
                borderTopLeftRadius: 1,
                borderTopRightRadius: 1,
              }}
            />
          </View>
        </View>
      );

    case 'live':
      return (
        <View style={[{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }, style]}>
          {/* Antennas */}
          <View style={{ flexDirection: 'row', width: s * 0.5, height: s * 0.16, justifyContent: 'space-between' }}>
            <View
              style={{
                width: 1.5,
                height: s * 0.18,
                backgroundColor: color,
                transform: [{ rotate: '-28deg' }],
              }}
            />
            <View
              style={{
                width: 1.5,
                height: s * 0.18,
                backgroundColor: color,
                transform: [{ rotate: '28deg' }],
              }}
            />
          </View>
          {/* TV body */}
          <View
            style={{
              width: s * 0.88,
              height: s * 0.62,
              borderWidth: 1.8,
              borderColor: color,
              borderRadius: 3,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Screen signal dot */}
            <View
              style={{
                width: s * 0.16,
                height: s * 0.16,
                borderRadius: s * 0.08,
                backgroundColor: color,
              }}
            />
          </View>
          {/* Stand */}
          <View style={{ width: s * 0.32, height: 1.5, backgroundColor: color, marginTop: 1 }} />
        </View>
      );

    case 'vod':
      return (
        <View style={[{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }, style]}>
          {/* Clapperboard top strip */}
          <View
            style={{
              width: s * 0.86,
              height: s * 0.24,
              backgroundColor: color,
              borderRadius: 2,
              flexDirection: 'row',
              justifyContent: 'space-around',
              alignItems: 'center',
              marginBottom: 1.5,
            }}
          >
            <View style={{ width: 2, height: '100%', backgroundColor: '#0A0E14', transform: [{ skewX: '-20deg' }] }} />
            <View style={{ width: 2, height: '100%', backgroundColor: '#0A0E14', transform: [{ skewX: '-20deg' }] }} />
            <View style={{ width: 2, height: '100%', backgroundColor: '#0A0E14', transform: [{ skewX: '-20deg' }] }} />
          </View>
          {/* Clapperboard body */}
          <View
            style={{
              width: s * 0.86,
              height: s * 0.52,
              borderWidth: 1.6,
              borderColor: color,
              borderRadius: 2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Play mini triangle */}
            <View
              style={{
                width: 0,
                height: 0,
                borderLeftWidth: s * 0.18,
                borderTopWidth: s * 0.12,
                borderBottomWidth: s * 0.12,
                borderLeftColor: color,
                borderTopColor: 'transparent',
                borderBottomColor: 'transparent',
              }}
            />
          </View>
        </View>
      );

    case 'fullscreen':
      return (
        <View style={[{ width: s, height: s, padding: 2, justifyContent: 'space-between' }, style]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ width: s * 0.28, height: s * 0.28, borderTopWidth: 2, borderLeftWidth: 2, borderColor: color }} />
            <View style={{ width: s * 0.28, height: s * 0.28, borderTopWidth: 2, borderRightWidth: 2, borderColor: color }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ width: s * 0.28, height: s * 0.28, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: color }} />
            <View style={{ width: s * 0.28, height: s * 0.28, borderBottomWidth: 2, borderRightWidth: 2, borderColor: color }} />
          </View>
        </View>
      );

    case 'volume-up':
      return (
        <View style={[{ width: s, height: s, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, style]}>
          {/* Speaker back box */}
          <View style={{ width: s * 0.2, height: s * 0.32, backgroundColor: color, borderRadius: 1 }} />
          {/* Speaker cone */}
          <View
            style={{
              width: 0,
              height: 0,
              borderRightWidth: s * 0.26,
              borderTopWidth: s * 0.28,
              borderBottomWidth: s * 0.28,
              borderRightColor: color,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
            }}
          />
          {/* Sound waves */}
          <View style={{ marginLeft: 3, height: s * 0.55, justifyContent: 'center' }}>
            <View
              style={{
                width: s * 0.18,
                height: s * 0.44,
                borderRightWidth: 2,
                borderColor: color,
                borderRadius: s * 0.22,
              }}
            />
          </View>
        </View>
      );

    case 'volume-off':
      return (
        <View style={[{ width: s, height: s, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, style]}>
          <View style={{ width: s * 0.2, height: s * 0.32, backgroundColor: color, borderRadius: 1 }} />
          <View
            style={{
              width: 0,
              height: 0,
              borderRightWidth: s * 0.26,
              borderTopWidth: s * 0.28,
              borderBottomWidth: s * 0.28,
              borderRightColor: color,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
            }}
          />
          {/* Muted X */}
          <View style={{ marginLeft: 3, width: s * 0.25, height: s * 0.25, justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ position: 'absolute', width: 1.8, height: s * 0.28, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
            <View style={{ position: 'absolute', width: 1.8, height: s * 0.28, backgroundColor: color, transform: [{ rotate: '-45deg' }] }} />
          </View>
        </View>
      );

    case 'play':
      return (
        <View style={[{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: s * 0.7,
              borderTopWidth: s * 0.44,
              borderBottomWidth: s * 0.44,
              borderLeftColor: color,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
              marginLeft: s * 0.1,
            }}
          />
        </View>
      );

    case 'back':
      return (
        <View style={[{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }, style]}>
          {/* Arrow pointing right for Hebrew RTL */}
          <View
            style={{
              width: s * 0.5,
              height: 2,
              backgroundColor: color,
              marginRight: 2,
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: s * 0.18,
              width: s * 0.32,
              height: s * 0.32,
              borderTopWidth: 2,
              borderRightWidth: 2,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    default:
      return null;
  }
};

export default TvIcon;
