import { forwardRef, memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RootRoute, RouteDefinition } from '../navigation/routes';
import { SideMenuIcon } from './SideMenuIcon';

interface SideMenuItemProps {
  route: RouteDefinition;
  active: boolean;
  expanded: boolean;
  onFocus: () => void;
  onSelectRoute: (route: RootRoute) => void;
}

export const SideMenuItem = memo(
  forwardRef<View, SideMenuItemProps>(function SideMenuItemView(
    { route, active, expanded, onFocus, onSelectRoute },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const isHighlighted = (focused && expanded) || (!expanded && active);

    return (
      <Pressable
        ref={ref}
        accessibilityLabel={route.label}
        accessibilityRole="button"
        focusable={expanded || active}
        unstable_pressDelay={0}
        onFocus={() => {
          setFocused(true);
          onFocus();
        }}
        onBlur={() => {
          setFocused(false);
        }}
        onPressIn={() => onSelectRoute(route.id)}
        style={[
          styles.item,
          expanded ? styles.itemExpanded : styles.itemCollapsed,
          isHighlighted && styles.itemHighlighted,
        ]}
      >
        <View style={styles.iconContainer}>
          <SideMenuIcon
            name={route.id}
            size={24}
            color="#ffffff"
            highlighted={isHighlighted}
          />
        </View>
        {expanded ? (
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              isHighlighted ? styles.labelHighlighted : styles.labelRegular,
            ]}
          >
            {route.label}
          </Text>
        ) : null}
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
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: '#ffffff',
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
    color: '#ffffff',
  },
  labelHighlighted: {
    fontWeight: '700',
  },
  labelRegular: {
    fontWeight: '500',
    color: '#ffffff',
  },
});

