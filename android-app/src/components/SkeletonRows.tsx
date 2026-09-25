import React, { memo, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { MEDIA_CAROUSEL_ITEM_SPACING } from '../theme/layout';

const CARD_COUNT_PER_ROW = 4;

interface SkeletonRowsProps {
  cardWidth: number;
  cardHeight: number;
}

export const SkeletonRows = memo(function SkeletonRowsView({
  cardWidth,
  cardHeight,
}: SkeletonRowsProps) {
  const colorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(colorAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(colorAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [colorAnim]);

  // Phase-shifted color interpolations for each card column to create a wave effect
  // using direct backgroundColor (0 extra offscreen GPU layers, 0 MB VRAM)
  const cardColor0 = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#131e29', '#24374a'],
  });

  const cardColor1 = colorAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#182635', '#24374a', '#131e29'],
  });

  const cardColor2 = colorAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#24374a', '#131e29', '#182635'],
  });

  const cardColor3 = colorAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#182635', '#131e29', '#24374a'],
  });

  const cardColors = [cardColor0, cardColor1, cardColor2, cardColor3];

  const headingColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#192837', '#253749'],
  });

  return (
    <View style={styles.container}>
      {/* Row 1 */}
      <View style={styles.row}>
        <Animated.View
          style={[styles.headingPlaceholder, { backgroundColor: headingColor }]}
        />
        <View style={styles.cardsRow}>
          {Array.from({ length: CARD_COUNT_PER_ROW }).map((_, idx) => (
            <Animated.View
              key={`sk-row1-${idx}`}
              testID="skeleton-card"
              style={[
                styles.cardBase,
                {
                  width: cardWidth,
                  height: cardHeight,
                  backgroundColor: cardColors[idx % 4],
                },
              ]}
            >
              <View style={styles.badgePlaceholder} />
              <View style={styles.titlePlaceholder} />
            </Animated.View>
          ))}
        </View>
      </View>

      {/* Row 2 */}
      <View style={[styles.row, styles.secondRow]}>
        <Animated.View
          style={[
            styles.headingPlaceholder,
            styles.secondaryHeadingPlaceholder,
            { backgroundColor: headingColor },
          ]}
        />
        <View style={styles.cardsRow}>
          {Array.from({ length: CARD_COUNT_PER_ROW }).map((_, idx) => (
            <Animated.View
              key={`sk-row2-${idx}`}
              testID="skeleton-card"
              style={[
                styles.cardBase,
                {
                  width: cardWidth,
                  height: cardHeight,
                  backgroundColor: cardColors[(idx + 2) % 4],
                },
              ]}
            >
              <View style={styles.badgePlaceholder} />
              <View style={styles.titlePlaceholder} />
            </Animated.View>
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
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'space-between',
    padding: 10,
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
