import React, { memo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { TvChannel } from '../../types/guide';

interface EpgChannelCardProps {
  channel: TvChannel;
  height: number;
  isActiveRow: boolean;
  isFocused: boolean;
  isPlaying: boolean;
}

export const EpgChannelCard: React.FC<EpgChannelCardProps> = memo(({
  channel,
  height,
  isActiveRow,
  isFocused,
  isPlaying,
}) => {
  const cardBg = isFocused ? '#E8EAEE' : isActiveRow ? '#565B64' : '#17181B';
  const nameColor = isFocused ? '#0A0E12' : '#FFFFFF';
  const subColor = isFocused ? '#2E343A' : isPlaying ? '#4ADE80' : '#8C8F98';

  return (
    <View
      style={[
        styles.container,
        {
          height: height - 6,
          backgroundColor: cardBg,
          borderColor: isFocused ? '#FFFFFF' : 'transparent',
          borderWidth: isFocused ? 2 : 1,
        },
      ]}
    >
      {/* Subtle highlight on active row */}
      {isActiveRow && !isFocused && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
          ]}
        />
      )}

      {/* Channel Logo */}
      <View
        style={[
          styles.logoBox,
          {
            backgroundColor: isFocused ? '#FFFFFF' : isActiveRow ? '#707680' : '#26272C',
          },
        ]}
      >
        {channel.logoUrl ? (
          <Image
            source={{ uri: channel.logoUrl }}
            style={styles.logo}
            resizeMode="contain"
          />
        ) : (
          <Text style={[styles.fallbackNumber, { color: isFocused ? '#0A0E12' : '#FFFFFF' }]}>
            {channel.number || channel.name.slice(0, 2)}
          </Text>
        )}
      </View>

      {/* Channel Info */}
      <View style={styles.info}>
        <Text numberOfLines={1} style={[styles.name, { color: nameColor }]}>
          {channel.name}
        </Text>
        <Text numberOfLines={1} style={[styles.sub, { color: subColor }]}>
          {isPlaying ? 'מנגן עכשיו' : channel.number ? `ערוץ ${channel.number}` : ''}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: 142,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
    position: 'relative',
    marginRight: 6,
  },
  logoBox: {
    width: 38,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    overflow: 'hidden',
  },
  logo: {
    width: 34,
    height: 34,
  },
  fallbackNumber: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  sub: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'left',
  },
});

export default EpgChannelCard;
