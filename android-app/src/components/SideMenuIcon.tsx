import { memo } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { RootRoute } from '../navigation/routes';

interface SideMenuIconProps {
  name: RootRoute;
  size?: number;
  color?: string;
  highlighted?: boolean;
  style?: StyleProp<ViewStyle>;
}

const ICON_MAP: Record<RootRoute, ImageSourcePropType> = {
  'home': require('../assets/icons/home.png'),
  'live-tv': require('../assets/icons/live-tv.png'),
  'vod': require('../assets/icons/vod.png'),
  'series': require('../assets/icons/series.png'),
  'movies': require('../assets/icons/movies.png'),
  'search': require('../assets/icons/search.png'),
  'settings': require('../assets/icons/settings.png'),
};

export const SideMenuIcon = memo(function SideMenuIconImpl({
  name,
  size = 22,
  color = '#ffffff',
  style,
}: SideMenuIconProps) {
  const iconSource = ICON_MAP[name];

  if (!iconSource) {
    return null;
  }

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Image
        source={iconSource}
        style={[styles.image, { width: size, height: size, tintColor: color }]}
        resizeMode="contain"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
