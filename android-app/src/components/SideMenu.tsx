import { memo, useLayoutEffect, useRef } from 'react';
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
  onActiveItemChange: (item: View | null) => void;
  onSelectRoute: (route: RootRoute) => void;
}

export const SideMenu = memo(function SideMenuView({
  activeRoute,
  expanded,
  onFocus,
  onActiveItemChange,
  onSelectRoute,
}: SideMenuProps) {
  const reveal = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useLayoutEffect(() => {
    const animation = Animated.timing(reveal, {
      toValue: expanded ? 1 : 0,
      duration: expanded ? 120 : 80,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [expanded, reveal]);

  const panelTranslate = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [-176, 0],
  });
  const labelOpacity = reveal.interpolate({
    inputRange: [0, 0.88, 1],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
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
        trapFocusUp
        trapFocusDown
        trapFocusLeft
        style={styles.items}
      >
        {routes.map(route => {
          const active = route.id === activeRoute;
          return (
            <SideMenuItem
              key={route.id}
              ref={active ? onActiveItemChange : undefined}
              active={active}
              expanded={expanded}
              labelOpacity={labelOpacity}
              onFocus={onFocus}
              onSelectRoute={onSelectRoute}
              route={route}
            />
          );
        })}
      </TVFocusGuideView>
    </View>
  );
});

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
