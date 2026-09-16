import React from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { TvFocusable } from './TvFocusable';
import { TvBadge } from './TvBadge';
import { ProgressBar } from './ProgressBar';

export interface TvCardProgramData {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  channelLogoUrl?: string | null;
  badgeType?: 'live' | 'vod' | null;
  progress?: number | null;
}

export interface TvProgramCardProps {
  program: TvCardProgramData;
  width?: number;
  height?: number;
  hasTVPreferredFocus?: boolean;
  hasPreferredFocus?: boolean;
  focusNonce?: number;
  lockUp?: boolean;
  lockDown?: boolean;
  lockLeft?: boolean;
  lockRight?: boolean;
  scaleOnFocus?: boolean;
  onPress: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
  scrimHeight?: number;
}

// 96-step 1px-per-row continuous CSS fade (each slice is 1dp tall, perfectly smooth zero-banding transition)
const FADE_STEPS = 96;
const FADE_STOPS: string[] = Array.from({ length: FADE_STEPS }, (_, i) => {
  const t = i / (FADE_STEPS - 1);
  // Natural cubic-like power curve (t^1.6) from 0.0 to 0.96 opacity
  const alpha = Math.min(0.96, Math.pow(t, 1.6) * 0.96);
  return `rgba(8, 10, 14, ${alpha.toFixed(3)})`;
});

export const TvProgramCard: React.FC<TvProgramCardProps> = React.memo(({
  program,
  width = 238,
  height = 154,
  hasTVPreferredFocus = false,
  hasPreferredFocus = false,
  focusNonce = 0,
  lockUp = false,
  lockDown = false,
  lockLeft = false,
  lockRight = false,
  scaleOnFocus = false,
  onPress,
  onFocus,
  onBlur,
  style,
  scrimHeight = 96,
}) => {
  const hasProgress = typeof program.progress === 'number' && program.progress > 0;

  return (
    <TvFocusable
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      hasTVPreferredFocus={hasTVPreferredFocus || hasPreferredFocus}
      focusNonce={focusNonce}
      lockUp={lockUp}
      lockDown={lockDown}
      lockLeft={lockLeft}
      lockRight={lockRight}
      scaleOnFocus={scaleOnFocus}
      style={[styles.card, { width, height }, style]}
      focusedStyle={styles.cardFocused}
    >
      <View style={styles.contentBox}>
        {/* Layer 1: Background Image / Thumbnail */}
        {program.imageUrl ? (
          <Image
            source={{ uri: program.imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : program.channelLogoUrl ? (
          <Image
            source={{ uri: program.channelLogoUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.placeholderBox]}>
            <Text style={styles.placeholderText}>▶</Text>
          </View>
        )}

        {/* Layer 2: Pure CSS Graduated Fade Scrim behind text */}
        <View pointerEvents="none" style={[styles.scrimContainer, { height: scrimHeight }]}>
          {FADE_STOPS.map((color, idx) => (
            <View key={idx} style={{ flex: 1, backgroundColor: color }} />
          ))}
        </View>

        {/* Layer 3: Top Badges */}
        {(program.badgeType || program.channelLogoUrl) && (
          <View style={styles.badgeRow}>
            {program.badgeType ? <TvBadge type={program.badgeType} /> : <View />}
            {program.channelLogoUrl ? (
              <View style={styles.channelBadgeBox}>
                <Image
                  source={{ uri: program.channelLogoUrl }}
                  style={styles.channelBadgeLogo}
                  resizeMode="contain"
                />
              </View>
            ) : null}
          </View>
        )}

        {/* Layer 4: Bottom Text Info */}
        <View style={styles.infoContainer}>
          {program.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {program.subtitle}
            </Text>
          ) : null}
          <Text style={styles.title} numberOfLines={program.subtitle ? 1 : 2}>
            {program.title || 'שידור חי'}
          </Text>
          {program.description ? (
            <Text style={styles.description} numberOfLines={1}>
              {program.description}
            </Text>
          ) : null}
        </View>

        {/* Layer 5: Progress Bar (for VOD continue watching) */}
        {hasProgress && (
          <View style={styles.progressWrapper}>
            <ProgressBar progress={program.progress!} height={5} />
          </View>
        )}
      </View>
    </TvFocusable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    backgroundColor: '#171B22',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
    marginRight: 14,
  },
  cardFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  contentBox: {
    flex: 1,
    backgroundColor: '#171B22',
  },
  placeholderBox: {
    backgroundColor: '#17181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 24,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  scrimContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  badgeRow: {
    position: 'absolute',
    top: 9,
    left: 9,
    right: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  channelBadgeBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(8, 10, 12, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  channelBadgeLogo: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    zIndex: 2,
    gap: 2,
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  description: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  progressWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
});

export default TvProgramCard;
