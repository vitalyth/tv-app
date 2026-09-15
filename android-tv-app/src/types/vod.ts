export type VodProvider = 'kan-vod' | 'keshet-vod' | 'reshet-vod' | 'c14-vod' | 'i24-vod';

export interface VodProviderInfo {
  id: VodProvider;
  endpoint: string;
  displayName: string;
  channelNumber: string;
  logoPath: string;
  logoUrl: string;
}

export const VOD_PROVIDERS: Record<VodProvider, VodProviderInfo> = {
  'kan-vod': {
    id: 'kan-vod',
    endpoint: 'kan-vod',
    displayName: 'כאן 11',
    channelNumber: '11',
    logoPath: 'kan.jpg',
    logoUrl: 'https://tv.bestcams.net/ch/kan.jpg',
  },
  'keshet-vod': {
    id: 'keshet-vod',
    endpoint: 'keshet-vod',
    displayName: 'קשת 12',
    channelNumber: '12',
    logoPath: 'mako.png',
    logoUrl: 'https://tv.bestcams.net/ch/mako.png',
  },
  'reshet-vod': {
    id: 'reshet-vod',
    endpoint: 'reshet-vod',
    displayName: 'רשת 13',
    channelNumber: '13',
    logoPath: '13.jpg',
    logoUrl: 'https://tv.bestcams.net/ch/13.jpg',
  },
  'c14-vod': {
    id: 'c14-vod',
    endpoint: 'c14-vod',
    displayName: 'עכשיו 14',
    channelNumber: '14',
    logoPath: '14tv.png',
    logoUrl: 'https://tv.bestcams.net/ch/14tv.png',
  },
  'i24-vod': {
    id: 'i24-vod',
    endpoint: 'i24-vod',
    displayName: 'i24NEWS',
    channelNumber: '15',
    logoPath: 'i24news.png',
    logoUrl: 'https://tv.bestcams.net/ch/i24news.png',
  },
};

export const VOD_PROVIDER_LIST: VodProviderInfo[] = Object.values(VOD_PROVIDERS);

export interface VodSeries {
  id: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  episodeCount: number;
  seasonCount: number;
  genre?: string | null;
  providerId: string;
  provider?: VodProvider;
}

export interface VodSeason {
  seasonId: string;
  programId: string;
  title: string;
  seasonNumber?: number;
}

export interface VodEpisode {
  id: string;
  programId: string;
  seasonId?: string | null;
  title: string;
  description: string;
  imageUrl?: string | null;
  playUrl?: string | null;
  streamEndpoint?: string | null;
  displayOrder: number;
  progress?: number;
}

export interface VodSeriesDetails {
  series: VodSeries;
  seasons: VodSeason[];
  episodes: VodEpisode[];
}

export interface VodPlaybackProgress {
  episodeId: string;
  seriesId?: string | null;
  positionMs: number;
  durationMs: number;
  lastWatchedAt: number;
  isCompleted: boolean;
}

export interface VodRecentItem {
  episodeId: string;
  seriesId?: string | null;
  title: string;
  seriesTitle?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  playUrl?: string | null;
  channelLogo?: string | null;
  channelName?: string | null;
  progressPercentage?: number;
  rawItem?: any;
}
