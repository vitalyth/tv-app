import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChannelLogo } from '../common/ChannelLogo';
import { TvBadge } from '../common/TvBadge';

interface HeroMetadataRowProps {
  channelLogoUrl?: string | null;
  channelName?: string;
  isLive?: boolean;
  showVodBadge?: boolean;
  subtitle?: string;
  timeRange?: string | null;
}

export const HeroMetadataRow: React.FC<HeroMetadataRowProps> = ({
  channelLogoUrl,
  channelName,
  isLive = true,
  showVodBadge = false,
  subtitle,
  timeRange,
}) => {
  return (
    <View style={styles.container}>
      {channelLogoUrl ? (
        <ChannelLogo url={channelLogoUrl} name={channelName} size={26} />
      ) : null}

      {isLive ? (
        <TvBadge type="live" />
      ) : showVodBadge ? (
        <TvBadge type="vod" />
      ) : null}

      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}

      {timeRange ? (
        <Text style={styles.timeRange} numberOfLines={1}>
          ·  {timeRange}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    gap: 10,
  },
  subtitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
  },
  timeRange: {
    color: '#B8C1CC',
    fontSize: 13,
    fontWeight: '400',
  },
});

