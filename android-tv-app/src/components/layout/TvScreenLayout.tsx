import React, { ReactNode } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { TvArtwork } from './TvArtwork';
import { TvInlinePlayer } from './TvInlinePlayer';
import { TvScrimGradients } from './TvScrimGradients';
import { TvHero, TvHeroProps } from '../hero/TvHero';
import { useTvNav } from '../../context/TvNavContext';

export interface TvScreenLayoutProps extends Partial<TvHeroProps> {
  backgroundImageUrl?: string | null;
  artworkTitle?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroDescription?: string;
  heroTimeRange?: string;
  heroChannelLogoUrl?: string | null;
  videoStreamUrl?: string | null;
  inlinePlayerStreamUrl?: string | null;
  isVideoRendering?: boolean;
  isVideoPaused?: boolean;
  isPlayerExpanded?: boolean;
  hasExternalPlayer?: boolean;
  showArtwork?: boolean;
  contentPadding?: StyleProp<ViewStyle>;
  overlayContent?: ReactNode;
  children: ReactNode;
}

export const TvScreenLayout: React.FC<TvScreenLayoutProps> = React.memo(({
  backgroundImageUrl,
  inlinePlayerStreamUrl,
  videoStreamUrl,
  isVideoRendering = false,
  isPlayerExpanded = false,
  hasExternalPlayer = false,
  showArtwork = true,
  title,
  heroTitle,
  subtitle,
  heroSubtitle,
  description,
  heroDescription,
  timeRange,
  heroTimeRange,
  channelLogoUrl,
  heroChannelLogoUrl,
  channelName,
  isLive = true,
  showVodBadge = false,
  isMuted = false,
  onToggleMute,
  onOpenFullScreen,
  actions,
  overlayContent,
  children,
}) => {
  const { railWidth, isFullscreenPlayerActive } = useTvNav();

  const effectiveTitle = heroTitle || title || '';
  const effectiveSubtitle = heroSubtitle || subtitle;
  const effectiveDescription = heroDescription || description || '';
  const effectiveTimeRange = heroTimeRange || timeRange;
  const effectiveLogo = heroChannelLogoUrl || channelLogoUrl;
  const effectiveStream = videoStreamUrl || inlinePlayerStreamUrl;

  return (
    <View style={[styles.rootContainer, hasExternalPlayer && styles.rootTransparent]}>
      {/* Layer 1: Background Full-Screen Artwork */}
      <TvArtwork imageUrl={backgroundImageUrl} visible={showArtwork} />

      {/* Layer 2: Background Full-Screen Inline Video Player (only if internal player) */}
      {!hasExternalPlayer && (
        <TvInlinePlayer
          streamUrl={effectiveStream}
          visible={!!effectiveStream && !isPlayerExpanded && !isFullscreenPlayerActive}
          isMuted={isMuted}
        />
      )}

      {/* Layers 3 & 4: Dual Scrim Gradients across the entire screen */}
      <TvScrimGradients />

      {/* Foreground Content Stack - Pushed dynamically by the side nav rail */}
      <View style={[styles.foregroundStack, { paddingLeft: railWidth + 24 }]}>
        {/* Layer 5: TvHero Header */}
        <View style={styles.heroWrapper}>
          <TvHero
            title={effectiveTitle}
            subtitle={effectiveSubtitle}
            description={effectiveDescription}
            timeRange={effectiveTimeRange}
            channelLogoUrl={effectiveLogo}
            channelName={channelName}
            isLive={isLive}
            showVodBadge={showVodBadge}
            isMuted={isMuted}
            onToggleMute={onToggleMute}
            hasActivePlayer={!!effectiveStream || !!onOpenFullScreen}
            onOpenFullScreen={onOpenFullScreen}
            actions={actions}
          />
        </View>

        {/* Layer 6: Main Content Slot (Only this slot changes per screen) */}
        <View style={styles.contentSlot}>
          {children}
        </View>
      </View>

      {/* Layer 7: Optional Overlay */}
      {overlayContent ? (
        <View style={StyleSheet.absoluteFill}>
          {overlayContent}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#080A0C',
    overflow: 'hidden',
  },
  rootTransparent: {
    backgroundColor: 'transparent',
  },
  foregroundStack: {
    flex: 1,
    paddingRight: 32,
    paddingTop: 28,
  },
  heroWrapper: {
    height: 180,
    marginBottom: 8,
    overflow: 'hidden',
  },
  contentSlot: {
    flex: 1,
  },
});

export default TvScreenLayout;
