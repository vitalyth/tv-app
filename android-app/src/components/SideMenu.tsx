import { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
} from 'react-native';
import { routes, type RootRoute } from '../navigation/routes';
import { SideMenuItem } from './SideMenuItem';

interface SideMenuProps {
  activeRoute: RootRoute;
  expanded: boolean;
  onFocus: () => void;
  onSelectRoute: (route: RootRoute) => void;
}

export function SideMenu({
  activeRoute,
  expanded,
  onFocus,
  onSelectRoute,
}: SideMenuProps) {
  const reveal = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(reveal, {
      toValue: expanded ? 1 : 0,
      duration: expanded ? 180 : 140,
      useNativeDriver: true,
    }).start();
  }, [expanded, reveal]);

  const panelTranslate = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [-176, 0],
  });
  const labelOpacity = reveal.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Animated.View
        style={[styles.panel, { transform: [{ translateX: panelTranslate }] }]}
      />
      <View style={styles.brand}>
        <Text style={styles.brandPrimary}>
          app<Text style={styles.brandAccent}>TV</Text>
        </Text>
        <Animated.Text style={[styles.brandTagline, { opacity: labelOpacity }]}>
          More to watch
        </Animated.Text>
      </View>
      <TVFocusGuideView
        autoFocus
        trapFocusUp
        trapFocusDown
        style={styles.items}
      >
        {routes.map(route => (
          <SideMenuItem
            key={route.id}
            active={route.id === activeRoute}
            expanded={expanded}
            onFocus={onFocus}
            onSelect={() => onSelectRoute(route.id)}
            route={route}
          />
        ))}
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    zIndex: 20,
    elevation: 20,
    left: 0,
    top: 0,
    bottom: 0,
    width: 260,
  },
  panel: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 13, 21, 0.94)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.12)',
  },
  brand: { height: 120, paddingLeft: 24, paddingTop: 24 },
  brandPrimary: { color: '#ffffff', fontSize: 28, fontWeight: '800' },
  brandAccent: { color: '#5db5ff' },
  brandTagline: { color: '#9db1c1', fontSize: 13, marginTop: 1 },
  items: { flex: 1, paddingTop: 4 },
});
