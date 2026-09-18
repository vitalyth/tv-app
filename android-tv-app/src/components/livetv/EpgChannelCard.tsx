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

const EpgChannelCardComponent: React.FC<EpgChannelCardProps> = ({
  channel,
  height,
  isActiveRow,
  isFocused,
  isPlaying,
}) => {
  const cardBg = isFocused ? '#FFFFFF' : isActiveRow ? '#343C48' : '#17181B';
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
            { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
          ]}
        />
      )}

      {/* Channel Logo */}
      <View
        style={[
          styles.logoBox,
          {
            width: isActiveRow ? 42 : 32,
            height: isActiveRow ? 42 : 32,
            borderRadius: isActiveRow ? 7 : 5,
            backgroundColor: isFocused ? '#FFFFFF' : isActiveRow ? '#47515F' : '#26272C',
          },
        ]}
      >
        {channel.logoUrl ? (
          <Image
            source={{ uri: channel.logoUrl }}
            style={{
              width: isActiveRow ? 38 : 28,
              height: isActiveRow ? 38 : 28,
            }}
            resizeMode="contain"
          />
        ) : (
          <Text style={[styles.fallbackNumber, { fontSize: isActiveRow ? 16 : 13, color: isFocused ? '#0A0E12' : '#FFFFFF' }]}>
            {channel.number || channel.name.slice(0, 2)}
          </Text>
        )}
      </View>

      {/* Channel Info */}
      <View style={styles.info}>
        <Text numberOfLines={1} style={[styles.name, { fontSize: isActiveRow ? 14 : 12, color: nameColor }]}>
          {channel.name}
        </Text>
        <Text numberOfLines={1} style={[styles.sub, { fontSize: isActiveRow ? 11.5 : 10, color: subColor }]}>
          {isPlaying ? 'מנגן עכשיו' : channel.number || ''}
        </Text>
      </View>
    </View>
  );
};

function areChannelCardPropsEqual(
  prev: EpgChannelCardProps,
  next: EpgChannelCardProps
): boolean {
  return (
    prev.channel.id === next.channel.id &&
    prev.height === next.height &&
    prev.isActiveRow === next.isActiveRow &&
    prev.isFocused === next.isFocused &&
    prev.isPlaying === next.isPlaying &&
    prev.channel.name === next.channel.name &&
    prev.channel.logoUrl === next.channel.logoUrl
  );
}

export const EpgChannelCard = memo(EpgChannelCardComponent, areChannelCardPropsEqual);

const styles = StyleSheet.create({
  container: {
    width: 142,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
    position: 'relative',
    marginRight: 6,
  },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    overflow: 'hidden',
  },
  logo: {
    width: 32,
    height: 32,
  },
  fallbackNumber: {
    fontSize: 14,
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
