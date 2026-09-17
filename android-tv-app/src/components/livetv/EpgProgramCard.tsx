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
  isPlaying: boolean;
  onPress: (program: TvProgram) => void;
}

const FADE_STEPS = 12;
const FADE_ALPHAS = Array.from({ length: FADE_STEPS }, (_, i) =>
  Math.pow(i / (FADE_STEPS - 1), 1.6)
);
const FADE_SLICES_FOCUSED = FADE_ALPHAS.map((a) => `rgba(242, 244, 247, ${a.toFixed(3)})`);
const FADE_SLICES_LIVE = FADE_ALPHAS.map((a) => `rgba(51, 54, 62, ${a.toFixed(3)})`);
const FADE_SLICES_DEFAULT = FADE_ALPHAS.map((a) => `rgba(36, 37, 42, ${a.toFixed(3)})`);

const EpgProgramCardComponent: React.FC<EpgProgramCardProps> = ({
  program,
  width,
  height,
  isFocused,
  isActiveRow,
  isLive,
  isPlaying,
  onPress,
}) => {
  const cardBg = isFocused ? '#F2F4F7' : isLive ? '#33363E' : '#24252A';
  const showImage = isActiveRow && !!program.imageUrl && width >= 115;
  const imageWidth = Math.min(130, Math.floor(width * 0.44));
  const sliceBgs = isFocused
    ? FADE_SLICES_FOCUSED
    : isLive
    ? FADE_SLICES_LIVE
    : FADE_SLICES_DEFAULT;

  return (
    <View
      style={[
        styles.card,
        {
          width: Math.max(width - 4, 30),
          height: height - 6,
          backgroundColor: cardBg,
          borderColor: isFocused ? '#FFFFFF' : 'transparent',
          borderWidth: isFocused ? 2 : 1,
        },
        isFocused && styles.cardFocusedShadow,
      ]}
    >
      {/* Background Program Thumbnail on the Left with smooth pure-CSS graduated fade */}
      {showImage && (
        <View style={[styles.imageContainer, { width: imageWidth }]}>
          <Image
            source={{ uri: program.imageUrl || undefined }}
            style={styles.image}
            resizeMode="cover"
          />
          <View style={styles.fadeOverlay}>
            {sliceBgs.map((bg, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  backgroundColor: bg,
                }}
              />
            ))}
          </View>
        </View>
      )}

      {/* LIVE Badge */}
      {isLive && width >= 80 && (
        <View
          style={[
            styles.liveBadge,
            { backgroundColor: isPlaying ? '#10B981' : '#E82034' },
          ]}
        >
          {isPlaying && <View style={styles.playTriangle} />}
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
      )}

      {/* Program Text (Title and Time Range) */}
      <View style={[styles.textContainer, showImage && { paddingLeft: imageWidth * 0.7 }]}>
        <Text
          numberOfLines={isActiveRow ? 2 : 1}
          style={[
            styles.title,
            {
              color: isFocused ? '#071114' : '#FFFFFF',
              fontSize: isActiveRow ? 13 : 12,
            },
          ]}
        >
          {program.title}
        </Text>

        <Text
          numberOfLines={1}
          style={[
            styles.timeRange,
            {
              color: isFocused ? '#323A3E' : '#AAAEB8',
            },
          ]}
        >
          {program.timeRange}
        </Text>
      </View>
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
    prev.program.id === next.program.id &&
    prev.program.title === next.program.title &&
    prev.program.imageUrl === next.program.imageUrl
  );
}

export const EpgProgramCard = memo(EpgProgramCardComponent, areProgramCardPropsEqual);

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    marginRight: 4,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 10,
    position: 'relative',
  },
  cardFocusedShadow: {
    zIndex: 20,
    elevation: 8,
  },
  imageContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
    borderTopLeftRadius: 7,
    borderBottomLeftRadius: 7,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fadeOverlay: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  textContainer: {
    zIndex: 2,
    justifyContent: 'center',
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'left',
    marginBottom: 2,
  },
  timeRange: {
    fontSize: 11,
    textAlign: 'left',
  },
  liveBadge: {
    position: 'absolute',
    top: 6,
    right: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    zIndex: 3,
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
    borderLeftColor: '#FFFFFF',
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
