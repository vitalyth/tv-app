import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatClock, HALF_HOUR_SECONDS, SLOT_WIDTH, HEADER_HEIGHT } from '../../utils/epgUtils';

interface LiveTvTimelineProps {
  startSeconds: number;
  endSeconds: number;
  nowSeconds: number;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTimelineSlot(sec: number): string {
  const d = new Date(sec * 1000);
  const day = SHORT_DAYS[d.getDay()];
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${hours}:${mins}`;
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
          <Text style={styles.slotText}>{formatTimelineSlot(slotSec)}</Text>
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
    width: SLOT_WIDTH - 6,
    height: HEADER_HEIGHT - 6,
    backgroundColor: 'rgba(23, 24, 27, 0.92)',
    borderRadius: 7,
    justifyContent: 'center',
    paddingLeft: 10,
    marginRight: 6,
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
    backgroundColor: '#E82034',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  nowBubbleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

export default LiveTvTimeline;
