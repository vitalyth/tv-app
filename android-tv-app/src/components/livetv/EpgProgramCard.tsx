import React, { memo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { TvProgram } from '../../types/guide';

interface EpgProgramCardProps {
  program: TvProgram;
  width: number;
  height: number;
  isFocused: boolean;
  isActiveRow: boolean;
  isLive: boolean;
  isPlaying?: boolean;
  visibleStartPx?: number;
  visibleEndPx?: number;
  visibleWidthPx?: number;
  onPress?: (program: TvProgram) => void;
}

const FADE_STEPS = 5;
const FADE_ALPHAS = Array.from({ length: FADE_STEPS }, (_, i) =>
  Math.pow(i / (FADE_STEPS - 1), 1.6)
);
const FADE_SLICES_FOCUSED = FADE_ALPHAS.map((a) => `rgba(255, 255, 255, ${a.toFixed(3)})`);
const FADE_SLICES_LIVE = FADE_ALPHAS.map((a) => `rgba(49, 51, 58, ${a.toFixed(3)})`);
const FADE_SLICES_DEFAULT = FADE_ALPHAS.map((a) => `rgba(36, 37, 42, ${a.toFixed(3)})`);

const EpgProgramCardComponent: React.FC<EpgProgramCardProps> = ({
  program,
  width,
  height,
  isFocused,
  isActiveRow,
  isLive,
  isPlaying,
  visibleStartPx,
  visibleEndPx,
  visibleWidthPx,
  onPress,
}) => {
  const cardWidth = Math.max(width - 6, 24);
  const cardHeight = height - 6;
  const cardBg = isFocused ? '#FFFFFF' : isLive ? '#31333A' : '#24252A';

  // Visible bounds within this card (clamped to card width)
  const visibleStart = Math.max(0, visibleStartPx ?? 0);
  const visibleEnd = visibleEndPx !== undefined ? Math.min(cardWidth, Math.max(0, visibleEndPx)) : cardWidth;
  const visibleWidth = visibleWidthPx !== undefined ? Math.max(0, visibleEnd - visibleStart) : cardWidth;

  const showImage = isActiveRow && !!program.imageUrl && visibleWidth >= 115;
  const imageWidth = Math.min(120, Math.floor(visibleWidth * 0.42));
  const sliceBgs = isFocused
    ? FADE_SLICES_FOCUSED
    : isLive
    ? FADE_SLICES_LIVE
    : FADE_SLICES_DEFAULT;
  const showLiveBadge = isLive && visibleWidth >= 60;

  // Anchoring calculations for RTL text
  // The Hebrew text starts near the right edge of the VISIBLE slice of the card
  const rightOffset = Math.max(0, cardWidth - visibleEnd) + 8;
  const leftReserved = showImage ? imageWidth + 12 : showLiveBadge ? 54 : 10;
  const maxTextWidth = Math.max(0, visibleWidth - leftReserved - 10);
  const showText = visibleWidth >= 32 && maxTextWidth >= 20;

  return (
    <View
      style={[
        styles.card,
        {
          width: cardWidth,
          height: cardHeight,
          backgroundColor: cardBg,
          borderColor: isFocused ? '#FFFFFF' : isLive ? '#4B4E57' : '#383A40',
          borderWidth: isFocused ? 2 : 1,
        },
        isFocused && styles.cardFocusedShadow,
      ]}
    >
      {/* Background Program Thumbnail on the Left with smooth graduated fade */}
      {showImage && (
        <View style={[styles.imageContainer, { width: imageWidth, left: visibleStart }]}>
          <Image
            source={{ uri: program.imageUrl || undefined }}
            style={styles.image}
            resizeMode="cover"
          />
          <View style={styles.fadeOverlay}>
            {sliceBgs.map((bg, idx) => (
              <View
                key={idx}
                style={{
                  flex: 1,
                  backgroundColor: bg,
                }}
              />
            ))}
          </View>
        </View>
      )}

      {/* LIVE Badge (Top-Left of visible area of card) */}
      {showLiveBadge && (
        <View
          style={[
            styles.liveBadge,
            {
              backgroundColor: isPlaying ? '#10B981' : '#E82034',
              left: visibleStart + 8,
            },
          ]}
        >
          {isPlaying && <View style={styles.playTriangle} />}
          <Text
            style={[
              styles.liveBadgeText,
              isPlaying && { color: '#031812' },
            ]}
          >
            LIVE
          </Text>
        </View>
      )}

      {/* Program Text (Title and Time Range - RTL Right Aligned within visible portion) */}
      {showText && (
        <View
          style={[
            styles.textContainer,
            {
              right: rightOffset,
              width: maxTextWidth,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[
              styles.title,
              {
                color: isFocused ? '#071114' : '#FFFFFF',
                fontSize: isActiveRow ? 13 : 11.5,
              },
            ]}
          >
            {program.title}
          </Text>

          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[
              styles.timeRange,
              {
                color: isFocused ? '#263238' : '#B1B4BC',
                fontSize: isActiveRow ? 10.5 : 9.5,
              },
            ]}
          >
            {program.timeRange}
          </Text>
        </View>
      )}
    </View>
  );
};

function areProgramCardPropsEqual(
  prev: EpgProgramCardProps,
  next: EpgProgramCardProps
): boolean {
  return (
    prev.isFocused === next.isFocused &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.isActiveRow === next.isActiveRow &&
    prev.isLive === next.isLive &&
    prev.isPlaying === next.isPlaying &&
    prev.visibleStartPx === next.visibleStartPx &&
    prev.visibleEndPx === next.visibleEndPx &&
    prev.visibleWidthPx === next.visibleWidthPx &&
    prev.program.id === next.program.id &&
    prev.program.title === next.program.title &&
    prev.program.imageUrl === next.program.imageUrl
  );
}

export const EpgProgramCard = memo(EpgProgramCardComponent, areProgramCardPropsEqual);

const styles = StyleSheet.create({
  card: {
    borderRadius: 7,
    marginRight: 6,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 8,
    position: 'relative',
  },
  cardFocusedShadow: {
    zIndex: 10,
    elevation: 4,
  },
  imageContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fadeOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  textContainer: {
    position: 'absolute',
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'flex-end',
    top: 2,
    bottom: 2,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 2,
    width: '100%',
  },
  timeRange: {
    fontSize: 10.5,
    fontWeight: '500',
    textAlign: 'right',
    width: '100%',
  },
  liveBadge: {
    position: 'absolute',
    top: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    zIndex: 10,
  },
  playTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 4,
    borderRightWidth: 0,
    borderBottomWidth: 3,
    borderTopWidth: 3,
    borderLeftColor: '#031812',
    borderRightColor: 'transparent',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  liveBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

export default EpgProgramCard;

