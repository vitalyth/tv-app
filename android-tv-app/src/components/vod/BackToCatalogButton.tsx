import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { TvIcon } from '../common/TvIcon';

interface BackToCatalogButtonProps {
  onPress: () => void;
  hasPreferredFocus?: boolean;
}

export const BackToCatalogButton: React.FC<BackToCatalogButtonProps> = React.memo(({
  onPress,
  hasPreferredFocus = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const fgColor = isFocused ? '#0A0E14' : '#F2F4F7';

  return (
    <Pressable
      hasTVPreferredFocus={hasPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={[
        styles.button,
        isFocused ? styles.buttonFocused : styles.buttonNormal,
      ]}
    >
      <View style={styles.contentRow}>
        <TvIcon name="back" size={14} color={fgColor} />
        <Text style={[styles.text, { color: fgColor }]}>
          חזרה
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  buttonNormal: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  buttonFocused: {
    backgroundColor: '#F2F4F7',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default BackToCatalogButton;
