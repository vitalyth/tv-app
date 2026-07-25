import {
  createVodProviderService,
  type VodProviderEpisode,
  type VodProviderNextEpisode,
  type VodProviderSeason,
  type VodProviderSeries,
  type VodProviderSeriesDetails,
  type VodProviderSeriesResponse,
} from "@/lib/services/vod-provider-service";

export type ReshetVodSeries = VodProviderSeries;
export type ReshetVodSeason = VodProviderSeason;
export type ReshetVodEpisode = VodProviderEpisode;
export type ReshetVodSeriesDetails = VodProviderSeriesDetails;
export type ReshetVodNextEpisode = VodProviderNextEpisode;
export type ReshetVodSeriesResponse = VodProviderSeriesResponse;

export const reshetVodService = createVodProviderService("/reshet-vod", "Reshet VOD");
