import React, { memo, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { MEDIA_CAROUSEL_ITEM_SPACING } from '../theme/layout';

const CARD_COUNT_PER_ROW = 4;

interface SkeletonCardProps {
  width: number;
  height: number;
  delayMs: number;
}

const SkeletonCard = memo(function SkeletonCardView({
  width,
  height,
  delayMs,
}: SkeletonCardProps) {
  const pulseAnim = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.85,
            duration: 850,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.15,
            duration: 850,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
    }, delayMs);

    return () => {
      clearTimeout(timer);
      anim?.stop();
    };
  }, [delayMs, pulseAnim]);

  return (
    <View testID="skeleton-card" style={[styles.cardBase, { width, height }]}>
      {/* Animated pulsing color overlay */}
      <Animated.View style={[styles.shimmerOverlay, { opacity: pulseAnim }]} />

      {/* Top placeholder: Badge */}
      <View style={styles.badgePlaceholder} />

      {/* Bottom placeholder: Title line */}
      <View style={styles.titlePlaceholder} />
    </View>
  );
});

interface SkeletonRowsProps {
  cardWidth: number;
  cardHeight: number;
}

export const SkeletonRows = memo(function SkeletonRowsView({
  cardWidth,
  cardHeight,
}: SkeletonRowsProps) {
  const headingPulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(headingPulseAnim, {
          toValue: 0.7,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(headingPulseAnim, {
          toValue: 0.3,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [headingPulseAnim]);

  return (
    <View style={styles.container}>
      {/* Row 1 */}
      <View style={styles.row}>
        <Animated.View
          style={[styles.headingPlaceholder, { opacity: headingPulseAnim }]}
        />
        <View style={styles.cardsRow}>
          {Array.from({ length: CARD_COUNT_PER_ROW }).map((_, idx) => (
            <SkeletonCard
              key={`sk-row1-${idx}`}
              width={cardWidth}
              height={cardHeight}
              delayMs={idx * 160}
            />
          ))}
        </View>
      </View>

      {/* Row 2 */}
      <View style={[styles.row, styles.secondRow]}>
        <Animated.View
          style={[
            styles.headingPlaceholder,
            styles.secondaryHeadingPlaceholder,
            { opacity: headingPulseAnim },
          ]}
        />
        <View style={styles.cardsRow}>
          {Array.from({ length: CARD_COUNT_PER_ROW }).map((_, idx) => (
            <SkeletonCard
              key={`sk-row2-${idx}`}
              width={cardWidth}
              height={cardHeight}
              delayMs={120 + idx * 160}
            />
          ))}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  row: {
    marginBottom: 18,
  },
  secondRow: {
    marginTop: 6,
  },
  headingPlaceholder: {
    width: 150,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#203244',
    marginBottom: 10,
  },
  secondaryHeadingPlaceholder: {
    width: 120,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: MEDIA_CAROUSEL_ITEM_SPACING,
  },
  cardBase: {
    backgroundColor: '#131e29',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'space-between',
    padding: 10,
  },
  shimmerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#263a4d',
  },
  badgePlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  titlePlaceholder: {
    width: '58%',
    height: 12,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
});
