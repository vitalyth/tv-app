import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { TvChannel } from '../../types/guide';
import { TvFocusable } from '../common/TvFocusable';

interface EpgChannelCardProps {
  channel: TvChannel;
  isSelected: boolean;
  isPlaying: boolean;
  onPress: (channel: TvChannel) => void;
  onFocus?: (channel: TvChannel) => void;
  hasPreferredFocus?: boolean;
  focusNonce?: number;
  lockLeft?: boolean;
  lockRight?: boolean;
}

export const EpgChannelCard: React.FC<EpgChannelCardProps> = ({
  channel,
  isSelected,
  isPlaying,
  onPress,
  onFocus,
  hasPreferredFocus = false,
  focusNonce = 0,
  lockLeft = true,
  lockRight = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.(channel);
  };

  return (
    <TvFocusable
      hasTVPreferredFocus={hasPreferredFocus}
      focusNonce={focusNonce}
      lockLeft={lockLeft}
      lockRight={lockRight}
      onFocus={handleFocus}
      onBlur={() => setIsFocused(false)}
      onPress={() => onPress(channel)}
      scaleOnFocus={false}
      style={[
        styles.container,
        isSelected && styles.containerSelected,
        isFocused && styles.containerFocused,
      ]}
    >
      {/* Channel Logo */}
      {channel.logoUrl ? (
        <Image
          source={{ uri: channel.logoUrl }}
          style={styles.logo}
          resizeMode="contain"
        />
      ) : (
        <View style={styles.logoFallback}>
          <Text style={styles.logoFallbackText}>
            {channel.number ?? channel.name.slice(0, 2)}
          </Text>
        </View>
      )}

      {/* Channel Name / Number */}
      <View style={styles.info}>
        <Text
          numberOfLines={1}
          style={[
            styles.name,
            isFocused ? styles.nameFocused : styles.nameNormal,
          ]}
        >
          {channel.name}
        </Text>
        {channel.number ? (
          <Text style={styles.number}>ערוץ {channel.number}</Text>
        ) : null}
      </View>

      {/* Playing dot indicator */}
      {isPlaying && <View style={styles.playingIndicator} />}
    </TvFocusable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 140,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#17181B',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 8,
  },
  containerSelected: {
    backgroundColor: '#20232A',
    borderColor: 'rgba(37, 212, 222, 0.4)',
  },
  containerFocused: {
    backgroundColor: '#F2F4F7',
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.04 }],
    elevation: 6,
    zIndex: 10,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 4,
  },
  logoFallback: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: '#252830',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  nameNormal: {
    color: '#FFFFFF',
  },
  nameFocused: {
    color: '#0A0E14',
  },
  number: {
    fontSize: 10,
    color: '#8E95A2',
    textAlign: 'right',
  },
  playingIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E50914',
  },
});

export default EpgChannelCard;

