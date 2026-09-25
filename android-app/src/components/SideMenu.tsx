import { memo, useLayoutEffect, useRef } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  TVFocusGuideView,
  View,
} from 'react-native';
import { routes, type RootRoute } from '../navigation/routes';
import { SideMenuItem } from './SideMenuItem';

const menuShadow = require('../assets/menu_shadow.png');

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
      duration: expanded ? 140 : 100,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [expanded, reveal]);

  const panelTranslate = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [-172, 0],
  });

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Animated.View
        style={[
          styles.panel,
          {
            transform: [{ translateX: panelTranslate }],
          },
        ]}
      >
        <View style={styles.panelSurface} />
        {expanded ? (
          <View pointerEvents="none" style={styles.shadowEdge}>
            <Image
              source={menuShadow}
              style={styles.shadowImage}
              resizeMode="stretch"
            />
          </View>
        ) : null}
      </Animated.View>
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
    left: 0,
    top: 0,
    bottom: 0,
    width: 320,
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 304,
  },
  panelSurface: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 240,
    backgroundColor: 'rgba(8, 10, 14, 0.94)',
  },
  shadowEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 240,
    width: 64,
  },
  shadowImage: {
    width: '100%',
    height: '100%',
  },
  items: {
    position: 'relative',
    zIndex: 10,
    width: 240,
    flex: 1,
    paddingTop: 36,
  },
});



