import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, DeviceEventEmitter, ActivityIndicator } from 'react-native';
import {
  VodProvider,
  VodSeries,
  VodSeriesDetails,
  VodSeason,
  VodEpisode,
  VOD_PROVIDERS,
  VOD_PROVIDER_LIST,
} from '../types/vod';
import { AppDestination } from '../types/guide';
import { api } from '../services/api';
import TvScreenLayout from '../components/layout/TvScreenLayout';
import VodChannelFilterRow from '../components/vod/VodChannelFilterRow';
import VodSeriesGrid from '../components/vod/VodSeriesGrid';
import VodSeriesDetailsView from '../components/vod/VodSeriesDetailsView';
import { TvFocusable } from '../components/common/TvFocusable';

interface VodScreenProps {
  onPlayEpisode: (episode: VodEpisode, series: VodSeries) => void;
  focusNonce?: number;
  onRequestSideNavFocus?: (dest: AppDestination) => void;
  isSideNavActive?: boolean;
}

export const VodScreen: React.FC<VodScreenProps> = ({
  onPlayEpisode,
  focusNonce = 0,
  onRequestSideNavFocus,
  isSideNavActive = false,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<VodProvider | null>(null);
  const [seriesList, setSeriesList] = useState<VodSeries[]>([]);
  const [isLoadingSeries, setIsLoadingSeries] = useState(true);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  // Active focused series in catalog
  const [focusedSeries, setFocusedSeries] = useState<VodSeries | null>(null);

  // Focus management
  const [cardFocusNonce, setCardFocusNonce] = useState(0);
  const [filterFocusNonce, setFilterFocusNonce] = useState(0);

  const focusedIndexRef = useRef(0);
  const isFilterFocusedRef = useRef(false);
  const pendingFocusRef = useRef(false);
  const prevFocusNonceRef = useRef(focusNonce);
  const lastNavTimeRef = useRef(0);
  const isSideNavActiveRef = useRef(isSideNavActive);
  isSideNavActiveRef.current = isSideNavActive;

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
        if (list.length > 0) {
          setFocusedSeries(list[0]);
          focusedIndexRef.current = 0;
          setTimeout(() => {
            setCardFocusNonce(Date.now());
          }, 50);
        }
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
        if (combined.length > 0) {
          setFocusedSeries(combined[0]);
          focusedIndexRef.current = 0;
          setTimeout(() => {
            setCardFocusNonce(Date.now());
          }, 50);
        }
      }
    } catch (err: any) {
      setSeriesError(err?.message || 'שגיאה בטעינת תוכניות');
    } finally {
      setTimeout(() => {
        setIsLoadingSeries(false);
        setCardFocusNonce(Date.now());
      }, 150);
    }
  }, []);

  useEffect(() => {
    loadSeries(selectedProvider);
  }, [selectedProvider, loadSeries]);

  // Handle focusNonce from parent
  useEffect(() => {
    if (focusNonce > 0 && focusNonce !== prevFocusNonceRef.current) {
      prevFocusNonceRef.current = focusNonce;
      if (seriesList.length > 0) {
        isFilterFocusedRef.current = false;
        setFilterFocusNonce(0);
        setCardFocusNonce(focusNonce);
      } else {
        pendingFocusRef.current = true;
      }
    }
  }, [focusNonce, seriesList]);

  // Remote key navigation
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'onTvRemoteKey',
      ({ keyCode, repeatCount = 0 }: { keyCode: number; repeatCount?: number }) => {
        if (selectedSeries || isSideNavActiveRef.current) return; // In details view or side nav active

        const now = Date.now();
        const timeSince = now - lastNavTimeRef.current;

        // DPAD_UP = 19
        if (keyCode === 19) {
          if (repeatCount > 0 && timeSince < 220) return;
          if (timeSince < 140) return;
          lastNavTimeRef.current = now;

          if (isFilterFocusedRef.current) return;

          if (focusedIndexRef.current < 5) {
            // From top row of grid, move UP to provider filters
            isFilterFocusedRef.current = true;
            setCardFocusNonce(0);
            setFilterFocusNonce(Date.now());
          }
        }
        // DPAD_DOWN = 20
        else if (keyCode === 20) {
          if (repeatCount > 0 && timeSince < 220) return;
          if (timeSince < 140) return;
          lastNavTimeRef.current = now;

          if (isFilterFocusedRef.current) {
            // From filters, move DOWN back to grid
            isFilterFocusedRef.current = false;
            setFilterFocusNonce(0);
            setCardFocusNonce(Date.now());
          }
        }
        // DPAD_LEFT = 21
        else if (keyCode === 21) {
          if (isFilterFocusedRef.current) {
            onRequestSideNavFocus?.(AppDestination.VOD);
          } else if (focusedIndexRef.current % 5 === 0) {
            // Leftmost column in grid: open side nav rail
            onRequestSideNavFocus?.(AppDestination.VOD);
          }
        }
      }
    );

    return () => sub.remove();
  }, [selectedSeries, onRequestSideNavFocus]);

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
    setTimeout(() => {
      setCardFocusNonce(Date.now());
    }, 50);
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

  if (isLoadingSeries || seriesList.length === 0) {
    return (
      <View style={styles.fullScreenLoading}>
        <TvFocusable
          hasTVPreferredFocus={true}
          focusable={true}
          scaleOnFocus={false}
          style={styles.loadingFocusContainer}
          focusedStyle={styles.loadingFocusContainer}
        >
          <ActivityIndicator size="large" color="#25D4DE" />
        </TvFocusable>
      </View>
    );
  }

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
          focusNonce={filterFocusNonce}
        />
      }
    >
      <View style={styles.content}>
        <VodSeriesGrid
          series={seriesList}
          isLoading={isLoadingSeries}
          error={seriesError}
          onSeriesPress={handleSeriesPress}
          onSeriesFocus={(s, idx) => {
            focusedIndexRef.current = idx;
            setFocusedSeries(s);
          }}
          targetFocusIndex={focusedIndexRef.current}
          cardFocusNonce={cardFocusNonce}
        />
      </View>
    </TvScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  fullScreenLoading: {
    flex: 1,
    backgroundColor: '#080A0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingFocusContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});

export default VodScreen;

