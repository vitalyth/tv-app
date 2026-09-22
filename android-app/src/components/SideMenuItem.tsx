import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RouteDefinition } from '../navigation/routes';

interface SideMenuItemProps {
  route: RouteDefinition;
  active: boolean;
  expanded: boolean;
  onFocus: () => void;
  onSelect: () => void;
}

export function SideMenuItem({
  route,
  active,
  expanded,
  onFocus,
  onSelect,
}: SideMenuItemProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel={route.label}
      accessibilityRole="button"
      onBlur={() => setFocused(false)}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onPress={onSelect}
      style={[styles.item, focused && styles.focusedItem]}
    >
      <View
        style={[
          styles.icon,
          active && styles.activeIcon,
          focused && styles.focusedIcon,
        ]}
      >
        <Text style={[styles.iconText, focused && styles.focusedText]}>
          {route.shortLabel}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          active && styles.activeLabel,
          focused && styles.focusedText,
          !expanded && styles.hiddenLabel,
        ]}
      >
        {route.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    width: 232,
    height: 56,
    marginBottom: 4,
    marginLeft: 14,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  focusedItem: { backgroundColor: '#183b55', borderColor: '#8cd3ff' },
  icon: {
    width: 48,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    backgroundColor: '#1d2a35',
  },
  activeIcon: { backgroundColor: '#6e42d3' },
  focusedIcon: { backgroundColor: '#147fc0' },
  iconText: { color: '#dbe8f2', fontSize: 14, fontWeight: '800' },
  label: { color: '#dbe8f2', fontSize: 20, marginLeft: 16 },
  activeLabel: { color: '#ffffff', fontWeight: '700' },
  focusedText: { color: '#ffffff' },
  hiddenLabel: { opacity: 0 },
});
