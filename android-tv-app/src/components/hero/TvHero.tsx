import React, { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { HeroMetadataRow } from './HeroMetadataRow';
import { HeroTitle } from './HeroTitle';
import { HeroDescription } from './HeroDescription';
import { HeroActions } from './HeroActions';

export interface TvHeroProps {
  title: string;
  subtitle?: string;
  description?: string;
  timeRange?: string | null;
  channelLogoUrl?: string | null;
  channelName?: string;
  isLive?: boolean;
  showVodBadge?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  hasActivePlayer?: boolean;
  onOpenFullScreen?: () => void;
  actions?: ReactNode;
}

export const TvHero: React.FC<TvHeroProps> = ({
  title,
  subtitle,
  description,
  timeRange,
  channelLogoUrl,
  channelName,
  isLive = true,
  showVodBadge = false,
  isMuted = false,
  onToggleMute,
  hasActivePlayer = false,
  onOpenFullScreen,
  actions,
}) => {
  return (
    <View style={styles.heroContainer}>
      <View style={styles.infoColumn}>
        <HeroMetadataRow
          channelLogoUrl={channelLogoUrl}
          channelName={channelName}
          isLive={isLive}
          showVodBadge={showVodBadge}
          subtitle={subtitle}
          timeRange={timeRange}
        />

        <HeroTitle title={title} />

        <HeroDescription description={description} />
      </View>

      <View style={styles.actionsColumn}>
        <HeroActions
          hasActivePlayer={hasActivePlayer}
          isMuted={isMuted}
          onToggleMute={onToggleMute}
          onOpenFullScreen={onOpenFullScreen}
          customActions={actions}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    height: 176,
    width: '100%',
    overflow: 'hidden',
  },
  infoColumn: {
    flex: 1,
    gap: 6,
  },
  actionsColumn: {
    paddingLeft: 20,
    alignItems: 'flex-end',
  },
});

