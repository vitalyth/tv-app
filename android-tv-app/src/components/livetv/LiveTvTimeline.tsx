import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface LiveTvTimelineProps {
  startSeconds?: number;
  nowSeconds?: number;
}

export const LiveTvTimeline: React.FC<LiveTvTimelineProps> = ({
  startSeconds = Math.floor((Date.now() / 1000 - 3600) / 1800) * 1800,
  nowSeconds = Math.floor(Date.now() / 1000),
}) => {
  const slots = [0, 1800, 3600, 5400, 7200, 9000];

  const formatTime = (seconds: number) => {
    const d = new Date(seconds * 1000);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.channelHeaderPlaceholder} />
      <View style={styles.slotsRow}>
        {slots.map((offset) => {
          const slotSec = startSeconds + offset;
          return (
            <View key={offset} style={styles.slot}>
              <Text style={styles.slotText}>{formatTime(slotSec)}</Text>
            </View>
          );
        })}

        {/* Current Time Red Line Badge */}
        <View style={styles.nowBadge}>
          <Text style={styles.nowText}>{formatTime(nowSeconds)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    marginBottom: 8,
  },
  channelHeaderPlaceholder: {
    width: 140,
  },
  slotsRow: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  slot: {
    width: 180,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 6,
    alignItems: 'center',
  },
  slotText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  nowBadge: {
    position: 'absolute',
    left: 260,
    backgroundColor: '#E53935',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 10,
  },
  nowText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});

export default LiveTvTimeline;

