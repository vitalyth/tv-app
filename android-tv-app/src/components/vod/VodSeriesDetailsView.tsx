import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import {
  VodProvider,
  VodSeries,
  VodSeriesDetails,
  VodSeason,
  VodEpisode,
  VOD_PROVIDERS,
} from '../../types/vod';
import TvScreenLayout from '../layout/TvScreenLayout';
import BackToCatalogButton from './BackToCatalogButton';
import SeasonPillsRow from './SeasonPillsRow';
import EpisodeRow from './EpisodeRow';

interface VodSeriesDetailsViewProps {
  series: VodSeries;
  details: VodSeriesDetails | null;
  selectedSeason: VodSeason | null;
  onSelectSeason: (season: VodSeason) => void;
  onClose: () => void;
  onPlayEpisode: (episode: VodEpisode, series: VodSeries) => void;
  focusedEpisode: VodEpisode | null;
  onEpisodeFocus: (episode: VodEpisode) => void;
}

export const VodSeriesDetailsView: React.FC<VodSeriesDetailsViewProps> = React.memo(({
  series,
  details,
  selectedSeason,
  onSelectSeason,
  onClose,
  onPlayEpisode,
  focusedEpisode,
  onEpisodeFocus,
}) => {
  const providerKey = (series.provider || series.providerId) as VodProvider;
  const providerInfo = providerKey && providerKey in VOD_PROVIDERS ? VOD_PROVIDERS[providerKey] : null;

  // Active season episodes
  const effectiveSeasonId = selectedSeason?.seasonId || details?.seasons[0]?.seasonId;
  const currentSeasonEpisodes = details?.episodes.filter(
    (ep) => !effectiveSeasonId || ep.seasonId === effectiveSeasonId
  ) ?? [];

  // Hero displays focused episode details, or falls back to series metadata
  const heroTitle = focusedEpisode?.title
    ? (focusedEpisode.title.includes(series.title) ? focusedEpisode.title : `${series.title} · ${focusedEpisode.title}`)
    : series.title;

  const heroSubtitle = listOfNotNull([
    providerInfo?.displayName || 'VOD',
    selectedSeason?.title || 'עונה 1',
    series.genre,
  ]).join(' · ');

  const heroDescription = focusedEpisode?.description || series.description;
  const backgroundImageUrl = focusedEpisode?.imageUrl || series.imageUrl || series.backdropUrl;

  if (!details) {
    return (
      <View style={styles.fullScreenLoading}>
        <ActivityIndicator size="large" color="#25D4DE" />
      </View>
    );
  }

  return (
    <TvScreenLayout
      backgroundImageUrl={backgroundImageUrl}
      heroTitle={heroTitle}
      heroSubtitle={heroSubtitle}
      heroDescription={heroDescription}
      heroChannelLogoUrl={providerInfo?.logoUrl}
      isLive={false}
      showVodBadge={true}
    >
      <View style={styles.content}>
        {/* Header Row: Back button + Episode count */}
        <View style={styles.headerRow}>
          <BackToCatalogButton onPress={onClose} hasPreferredFocus={true} />
          <Text style={styles.episodeCountText}>
            פרקים ({currentSeasonEpisodes.length})
          </Text>
        </View>

        {/* Season Selector Pills */}
        {details && details.seasons.length > 1 && (
          <SeasonPillsRow
            seasons={details.seasons}
            selectedSeason={selectedSeason || details.seasons[0]}
            onSelectSeason={onSelectSeason}
          />
        )}

        {/* Bottom Pinned Episodes Row */}
        <EpisodeRow
          episodes={currentSeasonEpisodes}
          onEpisodePress={(ep) => onPlayEpisode(ep, series)}
          onEpisodeFocus={onEpisodeFocus}
        />
      </View>
    </TvScreenLayout>
  );
});

function listOfNotNull(arr: (string | null | undefined)[]): string[] {
  return arr.filter((x): x is string => !!x && x.trim().length > 0 && x.toLowerCase() !== 'null');
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  fullScreenLoading: {
    flex: 1,
    backgroundColor: '#080A0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 10,
  },
  episodeCountText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});

export default VodSeriesDetailsView;
