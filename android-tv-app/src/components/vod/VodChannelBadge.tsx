import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { VodProvider, VOD_PROVIDERS } from '../../types/vod';
import { TvFocusable } from '../common/TvFocusable';

interface VodChannelBadgeProps {
  provider: VodProvider | null; // null represents "הכל" (All)
  isSelected: boolean;
  onSelect: (provider: VodProvider | null) => void;
  hasPreferredFocus?: boolean;
  focusNonce?: number;
  lockLeft?: boolean;
}

export const VodChannelBadge: React.FC<VodChannelBadgeProps> = ({
  provider,
  isSelected,
  onSelect,
  hasPreferredFocus = false,
  focusNonce = 0,
  lockLeft = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const providerInfo = provider ? VOD_PROVIDERS[provider] : null;
  const isAll = provider === null;

  return (
    <TvFocusable
      hasTVPreferredFocus={hasPreferredFocus}
      focusNonce={focusNonce}
      lockLeft={lockLeft}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={() => onSelect(provider)}
      scaleOnFocus={false}
      style={[
        styles.circle,
        isSelected && styles.circleSelected,
        isFocused && styles.circleFocused,
      ]}
    >
      {isAll ? (
        <Text
          style={[
            styles.allText,
            isFocused ? styles.allTextFocused : isSelected ? styles.allTextSelected : styles.allTextDefault,
          ]}
        >
          הכל
        </Text>
      ) : providerInfo?.logoUrl ? (
        <Image
          source={{ uri: providerInfo.logoUrl }}
          style={styles.logo}
          resizeMode="contain"
        />
      ) : (
        <Text style={styles.fallbackText}>{providerInfo?.displayName ?? ''}</Text>
      )}
    </TvFocusable>
  );
};

const styles = StyleSheet.create({
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#17181B',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  circleSelected: {
    borderColor: '#25D4DE',
    borderWidth: 2.5,
    backgroundColor: 'rgba(37, 212, 222, 0.15)',
  },
  circleFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
    backgroundColor: '#F2F4F7',
    transform: [{ scale: 1.08 }],
    elevation: 8,
  },
  allText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  allTextDefault: {
    color: '#FFFFFF',
  },
  allTextSelected: {
    color: '#25D4DE',
  },
  allTextFocused: {
    color: '#0A0E14',
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  fallbackText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default VodChannelBadge;

