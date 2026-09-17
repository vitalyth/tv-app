import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatClock, HALF_HOUR_SECONDS, SLOT_WIDTH, HEADER_HEIGHT } from '../../utils/epgUtils';

interface LiveTvTimelineProps {
  startSeconds: number;
  endSeconds: number;
  nowSeconds: number;
}

export const LiveTvTimeline: React.FC<LiveTvTimelineProps> = memo(({
  startSeconds,
  endSeconds,
  nowSeconds,
}) => {
  const totalSlots = Math.max(1, Math.floor((endSeconds - startSeconds) / HALF_HOUR_SECONDS));
  const slots: number[] = [];
  for (let i = 0; i < totalSlots; i++) {
    slots.push(startSeconds + i * HALF_HOUR_SECONDS);
  }

  const showNow = nowSeconds >= startSeconds && nowSeconds <= endSeconds;
  const nowOffsetPx = showNow
    ? ((nowSeconds - startSeconds) / HALF_HOUR_SECONDS) * SLOT_WIDTH
    : -1;

  return (
    <View style={styles.container}>
      {/* 30-Minute Interval Slots */}
      {slots.map((slotSec) => (
        <View key={slotSec} style={styles.slot}>
          <Text style={styles.slotText}>{formatClock(slotSec)}</Text>
        </View>
      ))}

      {/* Red LIVE Bubble Marker in Header */}
      {showNow && (
        <View style={[styles.nowBubble, { left: nowOffsetPx - 26 }]}>
          <Text style={styles.nowBubbleText}>{formatClock(nowSeconds)}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: HEADER_HEIGHT,
    position: 'relative',
    alignItems: 'center',
  },
  slot: {
    width: SLOT_WIDTH,
    height: HEADER_HEIGHT - 6,
    backgroundColor: 'rgba(23, 24, 27, 0.92)',
    borderRadius: 6,
    justifyContent: 'center',
    paddingLeft: 12,
    marginRight: 4,
  },
  slotText: {
    color: '#C8D1D6',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'left',
  },
  nowBubble: {
    position: 'absolute',
    width: 52,
    height: 20,
    backgroundColor: '#E21D2F',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  nowBubbleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

export default LiveTvTimeline;
