import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  VodProvider,
  VodSeries,
  VodSeriesDetails,
  VodSeason,
  VodEpisode,
  VOD_PROVIDERS,
  VOD_PROVIDER_LIST,
} from '../types/vod';
import { api } from '../services/api';
import TvScreenLayout from '../components/layout/TvScreenLayout';
import VodChannelFilterRow from '../components/vod/VodChannelFilterRow';
import VodSeriesGrid from '../components/vod/VodSeriesGrid';
import VodSeriesDetailsView from '../components/vod/VodSeriesDetailsView';

interface VodScreenProps {
  onPlayEpisode: (episode: VodEpisode, series: VodSeries) => void;
}

export const VodScreen: React.FC<VodScreenProps> = ({ onPlayEpisode }) => {
  const [selectedProvider, setSelectedProvider] = useState<VodProvider | null>(null);
  const [seriesList, setSeriesList] = useState<VodSeries[]>([]);
  const [isLoadingSeries, setIsLoadingSeries] = useState(true);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  // Active focused series in catalog
  const [focusedSeries, setFocusedSeries] = useState<VodSeries | null>(null);

  // Details screen state
  const [selectedSeries, setSelectedSeries] = useState<VodSeries | null>(null);
  const [seriesDetails, setSeriesDetails] = useState<VodSeriesDetails | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<VodSeason | null>(null);
  const [focusedEpisode, setFocusedEpisode] = useState<VodEpisode | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Load series based on selected provider
  const loadSeries = useCallback(async (provider: VodProvider | null) => {
    setIsLoadingSeries(true);
    setSeriesError(null);
    try {
      if (provider) {
        const list = await api.getVodSeries(provider);
        setSeriesList(list);
        if (list.length > 0) setFocusedSeries(list[0]);
      } else {
        // Load combined initial series from all providers
        const results = await Promise.allSettled(
          VOD_PROVIDER_LIST.map((p) => api.getVodSeries(p.id))
        );
        const combined: VodSeries[] = [];
        for (const res of results) {
          if (res.status === 'fulfilled') {
            combined.push(...res.value.slice(0, 12));
          }
        }
        setSeriesList(combined);
        if (combined.length > 0) setFocusedSeries(combined[0]);
      }
    } catch (err: any) {
      setSeriesError(err?.message || 'שגיאה בטעינת תוכניות');
    } finally {
      setIsLoadingSeries(false);
    }
  }, []);

  useEffect(() => {
    loadSeries(selectedProvider);
  }, [selectedProvider, loadSeries]);

  const handleSelectProvider = (provider: VodProvider | null) => {
    setSelectedProvider(provider);
  };

  const handleSeriesPress = async (series: VodSeries) => {
    setSelectedSeries(series);
    setIsLoadingDetails(true);
    setFocusedEpisode(null);
    try {
      const details = await api.getVodSeriesDetails(series.providerId || 'kan-vod', series.id);
      setSeriesDetails(details);
      if (details.seasons.length > 0) {
        setSelectedSeason(details.seasons[0]);
      }
      if (details.episodes.length > 0) {
        setFocusedEpisode(details.episodes[0]);
      }
    } catch {
      // Fallback: create single-season details from series item
      const fallbackDetails: VodSeriesDetails = {
        series,
        seasons: [{ seasonId: 'season-1', programId: series.id, title: 'עונה 1' }],
        episodes: [
          {
            id: `${series.id}_ep_1`,
            programId: series.id,
            title: series.title,
            description: series.description,
            imageUrl: series.imageUrl,
            displayOrder: 1,
          },
        ],
      };
      setSeriesDetails(fallbackDetails);
      setSelectedSeason(fallbackDetails.seasons[0]);
      setFocusedEpisode(fallbackDetails.episodes[0]);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleCloseDetails = () => {
    setSelectedSeries(null);
    setSeriesDetails(null);
    setSelectedSeason(null);
    setFocusedEpisode(null);
  };

  // If viewing series details, render details view
  if (selectedSeries) {
    return (
      <VodSeriesDetailsView
        series={selectedSeries}
        details={seriesDetails}
        selectedSeason={selectedSeason}
        onSelectSeason={(season) => setSelectedSeason(season)}
        onClose={handleCloseDetails}
        onPlayEpisode={onPlayEpisode}
        focusedEpisode={focusedEpisode}
        onEpisodeFocus={(ep) => setFocusedEpisode(ep)}
      />
    );
  }

  // Catalog View
  const activeSeries = focusedSeries || seriesList[0] || null;
  const providerInfo = selectedProvider
    ? VOD_PROVIDERS[selectedProvider]
    : activeSeries?.providerId
    ? VOD_PROVIDERS[activeSeries.providerId as VodProvider]
    : null;

  return (
    <TvScreenLayout
      backgroundImageUrl={activeSeries?.imageUrl}
      heroTitle={activeSeries?.title || 'קטלוג סדרות ו-VOD'}
      heroSubtitle={activeSeries?.genre || providerInfo?.displayName}
      heroDescription={activeSeries?.description || ''}
      heroChannelLogoUrl={providerInfo?.logoUrl}
      isLive={false}
      showVodBadge={true}
      actions={
        <VodChannelFilterRow
          selectedProvider={selectedProvider}
          onSelectProvider={handleSelectProvider}
        />
      }
    >
      <View style={styles.content}>
        <VodSeriesGrid
          series={seriesList}
          isLoading={isLoadingSeries}
          error={seriesError}
          onSeriesPress={handleSeriesPress}
          onSeriesFocus={(s) => setFocusedSeries(s)}
        />
      </View>
    </TvScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
});

export default VodScreen;

