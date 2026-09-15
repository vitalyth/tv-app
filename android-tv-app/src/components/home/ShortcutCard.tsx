import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TvFocusable } from '../common/TvFocusable';
import { TvIcon, TvIconType } from '../common/TvIcon';

interface ShortcutCardProps {
  title: string;
  subtitle: string;
  iconName: TvIconType;
  onPress: () => void;
  onFocus?: () => void;
  hasPreferredFocus?: boolean;
  hasTVPreferredFocus?: boolean;
  focusNonce?: number;
  isFirstCard?: boolean;
  isLastCard?: boolean;
}

export const ShortcutCard: React.FC<ShortcutCardProps> = React.memo(({
  title,
  subtitle,
  iconName,
  onPress,
  onFocus,
  hasPreferredFocus = false,
  hasTVPreferredFocus = false,
  focusNonce = 0,
  isFirstCard = false,
  isLastCard = false,
}) => {
  return (
    <TvFocusable
      onPress={onPress}
      onFocus={onFocus}
      hasTVPreferredFocus={hasTVPreferredFocus || hasPreferredFocus}
      focusNonce={focusNonce}
      lockUp={true}
      lockDown={true}
      lockLeft={isFirstCard}
      lockRight={isLastCard}
      scaleOnFocus={false}
      style={styles.card}
      focusedStyle={styles.cardFocused}
    >
      {({ focused }) => (
        <View style={styles.contentRow}>
          <View style={[styles.iconBox, focused ? styles.iconBoxFocused : styles.iconBoxIdle]}>
            <TvIcon
              name={iconName}
              size={22}
              color={focused ? '#0A0E14' : '#25D4DE'}
            />
          </View>
          <View style={styles.textColumn}>
            <Text style={[styles.title, focused && styles.titleFocused]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
      )}
    </TvFocusable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 202,
    height: 104,
    borderRadius: 8,
    backgroundColor: '#171B22',
    marginRight: 14,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cardFocused: {
    backgroundColor: '#F2F4F7',
    borderColor: '#F2F4F7',
    borderWidth: 2,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxIdle: {
    backgroundColor: 'rgba(37, 212, 222, 0.12)',
  },
  iconBoxFocused: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  titleFocused: {
    color: '#0A0E14',
  },
  subtitle: {
    color: '#8E95A2',
    fontSize: 12,
    fontWeight: '400',
  },
});

export default ShortcutCard;
