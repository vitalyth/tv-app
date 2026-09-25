import { forwardRef, memo } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import type { RootRoute, RouteDefinition } from '../navigation/routes';
import { SideMenuIcon } from './SideMenuIcon';

interface SideMenuItemProps {
  route: RouteDefinition;
  active: boolean;
  expanded: boolean;
  labelOpacity: Animated.AnimatedInterpolation<number>;
  onFocus: () => void;
  onSelectRoute: (route: RootRoute) => void;
}

export const SideMenuItem = memo(
  forwardRef<View, SideMenuItemProps>(function SideMenuItemView(
    { route, active, expanded, labelOpacity, onFocus, onSelectRoute },
    ref,
  ) {
    return (
      <Pressable
        ref={ref}
        accessibilityLabel={route.label}
        accessibilityRole="button"
        focusable={expanded || active}
        unstable_pressDelay={0}
        onFocus={onFocus}
        onPressIn={() => onSelectRoute(route.id)}
        style={({ focused }) => {
          const isHighlighted = (focused && expanded) || (!expanded && active);
          return [
            styles.item,
            expanded ? styles.itemExpanded : styles.itemCollapsed,
            isHighlighted && styles.itemHighlighted,
          ];
        }}
      >
        {({ focused }) => {
          const isHighlighted = (focused && expanded) || (!expanded && active);
          const iconColor = isHighlighted ? '#ffffff' : '#9db1c1';
          return (
            <>
              <View style={styles.iconContainer}>
                <SideMenuIcon
                  name={route.id}
                  size={22}
                  color={iconColor}
                  highlighted={isHighlighted}
                />
              </View>
              {expanded ? (
                <Animated.Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    isHighlighted
                      ? styles.labelHighlighted
                      : styles.labelDimmed,
                    { opacity: labelOpacity },
                  ]}
                >
                  {route.label}
                </Animated.Text>
              ) : null}
            </>
          );
        }}
      </Pressable>
    );
  }),
);

const styles = StyleSheet.create({
  item: {
    height: 48,
    marginBottom: 6,
    marginLeft: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.8,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  itemCollapsed: {
    width: 48,
    justifyContent: 'center',
  },
  itemExpanded: {
    width: 216,
    paddingLeft: 4,
    paddingRight: 16,
  },
  itemHighlighted: {
    backgroundColor: 'rgba(10, 132, 255, 0.28)',
    borderColor: '#0a84ff',
  },
  iconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    marginLeft: 10,
  },
  labelHighlighted: {
    color: '#ffffff',
    fontWeight: '600',
  },
  labelDimmed: {
    color: '#9db1c1',
    fontWeight: '400',
  },
});
