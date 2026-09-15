import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TvIcon } from './TvIcon';

interface TvBadgeProps {
  type: 'live' | 'vod' | 'count';
  count?: number;
  label?: string;
}

export const TvBadge: React.FC<TvBadgeProps> = React.memo(({ type, count, label }) => {
  if (type === 'live') {
    return (
      <View style={styles.liveBadge}>
        <TvIcon name="play" size={11} color="#FFFFFF" />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
    );
  }

  if (type === 'vod') {
    return (
      <View style={styles.vodBadge}>
        <TvIcon name="vod" size={12} color="#091016" />
        <Text style={styles.vodText}>VOD</Text>
      </View>
    );
  }

  return (
    <View style={styles.countBadge}>
      <Text style={styles.countText}>{label || `${count || 0} פרקים`}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E21D2F',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  vodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25D4DE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  vodText: {
    color: '#091016',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  countBadge: {
    backgroundColor: 'rgba(8, 10, 14, 0.8)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
  },
});

export default TvBadge;
