import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TvFocusable } from '../common/TvFocusable';
import { TvIcon, TvIconType } from '../common/TvIcon';
import { AppDestination } from '../../types/guide';

interface NavRailItemProps {
  destination: AppDestination;
  iconName: TvIconType;
  label: string;
  isSelected: boolean;
  isRailExpanded: boolean;
  isForcedFocused?: boolean;
  hasTVPreferredFocus?: boolean;
  focusNonce?: number;
  onSelect: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

export const NavRailItem: React.FC<NavRailItemProps> = React.memo(({
  iconName,
  label,
  isSelected,
  isRailExpanded,
  isForcedFocused = false,
  hasTVPreferredFocus = false,
  focusNonce = 0,
  onSelect,
  onFocus,
  onBlur,
}) => {
  return (
    <TvFocusable
      focusable={isRailExpanded || (hasTVPreferredFocus && focusNonce > 0)}
      onPress={onSelect}
      onFocus={onFocus}
      onBlur={onBlur}
      hasTVPreferredFocus={hasTVPreferredFocus && focusNonce > 0}
      focusNonce={focusNonce}
      lockLeft={true}
      lockRight={true}
      scaleOnFocus={false}
      style={[
        styles.item,
        isRailExpanded ? styles.itemExpanded : styles.itemCollapsed,
        isSelected && styles.itemSelected,
        isForcedFocused && styles.itemFocused,
      ]}
      focusedStyle={styles.itemFocused}
    >
      {({ focused }) => {
        const isEffectiveFocused = focused || isForcedFocused;
        const contentColor = isEffectiveFocused
          ? '#0A0E14'
          : isSelected
          ? '#F2F4F7'
          : '#8E95A2';

        return (
          <View style={styles.contentRow}>
            <TvIcon
              name={iconName}
              size={18}
              color={contentColor}
            />
            {isRailExpanded && (
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: contentColor },
                  (focused || isSelected) && styles.labelActive,
                ]}
              >
                {label}
              </Text>
            )}
          </View>
        );
      }}
    </TvFocusable>
  );
});

const styles = StyleSheet.create({
  item: {
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
    paddingHorizontal: 11,
  },
  itemCollapsed: {
    width: 44,
  },
  itemExpanded: {
    alignItems: 'flex-start',
    width: 156,
  },
  itemSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  itemFocused: {
    backgroundColor: '#F2F4F7',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '400',
  },
  labelActive: {
    fontWeight: '600',
  },
});

export default NavRailItem;
