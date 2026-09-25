import { memo } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { RootRoute } from '../navigation/routes';

interface SideMenuIconProps {
  name: RootRoute;
  size?: number;
  color?: string;
  highlighted?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const SideMenuIcon = memo(function SideMenuIconImpl({
  name,
  size = 22,
  color = '#ffffff',
  highlighted = false,
  style,
}: SideMenuIconProps) {
  const s = size;
  const cutoutColor = highlighted ? '#083863' : '#080d14';

  switch (name) {
    case 'home':
      return (
        <View style={[styles.center, { width: s, height: s }, style]}>
          <View
            style={[
              styles.roofTriangle,
              {
                borderLeftWidth: s * 0.46,
                borderRightWidth: s * 0.46,
                borderBottomWidth: s * 0.4,
                borderBottomColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.houseBody,
              {
                width: s * 0.7,
                height: s * 0.44,
                backgroundColor: color,
              },
            ]}
          >
            <View
              style={[
                styles.houseDoor,
                {
                  width: s * 0.24,
                  height: s * 0.26,
                  backgroundColor: cutoutColor,
                },
              ]}
            />
          </View>
        </View>
      );

    case 'live-tv':
      return (
        <View style={[styles.center, { width: s, height: s }, style]}>
          <View
            style={[
              styles.tvScreen,
              {
                width: s * 0.88,
                height: s * 0.58,
                borderColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.tvNeck,
              {
                height: s * 0.08,
                backgroundColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.tvBase,
              {
                width: s * 0.42,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      );

    case 'vod':
      return (
        <View style={[styles.center, { width: s, height: s }, style]}>
          <View
            style={[
              styles.clapperTop,
              {
                width: s * 0.86,
                height: s * 0.22,
                borderColor: color,
              },
            ]}
          >
            <View
              style={[styles.clapperStripe, { backgroundColor: color }]}
            />
            <View
              style={[styles.clapperStripe, { backgroundColor: color }]}
            />
            <View
              style={[styles.clapperStripe, { backgroundColor: color }]}
            />
          </View>
          <View
            style={[
              styles.clapperBody,
              {
                width: s * 0.86,
                height: s * 0.48,
                borderColor: color,
              },
            ]}
          >
            <View
              style={[
                styles.triangleRight,
                {
                  borderLeftWidth: s * 0.18,
                  borderTopWidth: s * 0.12,
                  borderBottomWidth: s * 0.12,
                  borderLeftColor: color,
                },
              ]}
            />
          </View>
        </View>
      );

    case 'series':
      return (
        <View style={[styles.center, { width: s, height: s }, style]}>
          <View style={[styles.calendarRingsRow, { width: s * 0.52 }]}>
            <View
              style={[styles.calendarRing, { backgroundColor: color }]}
            />
            <View
              style={[styles.calendarRing, { backgroundColor: color }]}
            />
          </View>
          <View
            style={[
              styles.calendarBody,
              {
                width: s * 0.82,
                height: s * 0.64,
                borderColor: color,
              },
            ]}
          >
            <View
              style={[
                styles.calendarDivider,
                {
                  top: s * 0.14,
                  backgroundColor: color,
                },
              ]}
            />
            <View
              style={[
                styles.triangleRight,
                {
                  borderLeftWidth: s * 0.18,
                  borderTopWidth: s * 0.12,
                  borderBottomWidth: s * 0.12,
                  borderLeftColor: color,
                  marginTop: s * 0.12,
                },
              ]}
            />
          </View>
        </View>
      );

    case 'movies':
      return (
        <View style={[styles.center, { width: s, height: s }, style]}>
          <View
            style={[
              styles.reelOuter,
              {
                width: s * 0.86,
                height: s * 0.86,
                borderRadius: (s * 0.86) / 2,
                borderColor: color,
              },
            ]}
          >
            <View
              style={[
                styles.center,
                {
                  width: s * 0.22,
                  height: s * 0.22,
                  borderRadius: (s * 0.22) / 2,
                  backgroundColor: color,
                },
              ]}
            />
            <View
              style={[styles.reelDotTop, { backgroundColor: color }]}
            />
            <View
              style={[styles.reelDotBottom, { backgroundColor: color }]}
            />
            <View
              style={[styles.reelDotLeft, { backgroundColor: color }]}
            />
            <View
              style={[styles.reelDotRight, { backgroundColor: color }]}
            />
          </View>
        </View>
      );

    case 'search':
      return (
        <View style={[styles.center, { width: s, height: s }, style]}>
          <View
            style={[styles.searchContainer, { width: s * 0.84, height: s * 0.84 }]}
          >
            <View
              style={[
                styles.searchLens,
                {
                  width: s * 0.56,
                  height: s * 0.56,
                  borderRadius: (s * 0.56) / 2,
                  borderColor: color,
                },
              ]}
            />
            <View
              style={[
                styles.searchHandle,
                {
                  bottom: s * 0.06,
                  right: s * 0.06,
                  height: s * 0.36,
                  backgroundColor: color,
                },
              ]}
            />
          </View>
        </View>
      );

    case 'settings':
      return (
        <View style={[styles.center, { width: s, height: s }, style]}>
          <View
            style={[
              styles.gearToothH,
              {
                width: s * 0.86,
                backgroundColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.gearToothV,
              {
                height: s * 0.86,
                backgroundColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.gearToothDiag1,
              {
                width: s * 0.86,
                backgroundColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.gearToothDiag2,
              {
                width: s * 0.86,
                backgroundColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.gearHub,
              {
                width: s * 0.7,
                height: s * 0.7,
                borderRadius: (s * 0.7) / 2,
                borderColor: color,
                backgroundColor: cutoutColor,
              },
            ]}
          >
            <View
              style={[
                styles.center,
                {
                  width: s * 0.22,
                  height: s * 0.22,
                  borderRadius: (s * 0.22) / 2,
                  backgroundColor: color,
                },
              ]}
            />
          </View>
        </View>
      );

    default:
      return null;
  }
});

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  roofTriangle: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  houseBody: {
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  houseDoor: {
    borderTopLeftRadius: 1.5,
    borderTopRightRadius: 1.5,
  },
  tvScreen: {
    borderWidth: 1.8,
    borderRadius: 2.5,
  },
  tvNeck: {
    width: 2,
  },
  tvBase: {
    height: 1.8,
    borderRadius: 1,
  },
  clapperTop: {
    borderWidth: 1.6,
    borderRadius: 2,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 1.5,
    overflow: 'hidden',
  },
  clapperStripe: {
    width: 1.6,
    height: '100%',
    transform: [{ skewX: '-25deg' }],
  },
  clapperBody: {
    borderWidth: 1.6,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triangleRight: {
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: 1.5,
  },
  calendarRingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 2,
    marginBottom: -2,
  },
  calendarRing: {
    width: 2,
    height: 3.5,
    borderRadius: 1,
  },
  calendarBody: {
    borderWidth: 1.6,
    borderRadius: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  calendarDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.4,
  },
  reelOuter: {
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelDotTop: {
    position: 'absolute',
    top: 2,
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
  },
  reelDotBottom: {
    position: 'absolute',
    bottom: 2,
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
  },
  reelDotLeft: {
    position: 'absolute',
    left: 2,
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
  },
  reelDotRight: {
    position: 'absolute',
    right: 2,
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
  },
  searchContainer: {
    position: 'relative',
  },
  searchLens: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: 1.8,
  },
  searchHandle: {
    position: 'absolute',
    width: 2.2,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },
  gearToothH: {
    position: 'absolute',
    height: 2.2,
    borderRadius: 0.8,
  },
  gearToothV: {
    position: 'absolute',
    width: 2.2,
    borderRadius: 0.8,
  },
  gearToothDiag1: {
    position: 'absolute',
    height: 2.2,
    borderRadius: 0.8,
    transform: [{ rotate: '45deg' }],
  },
  gearToothDiag2: {
    position: 'absolute',
    height: 2.2,
    borderRadius: 0.8,
    transform: [{ rotate: '-45deg' }],
  },
  gearHub: {
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

