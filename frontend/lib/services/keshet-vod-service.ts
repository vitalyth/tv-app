import {
  createVodProviderService,
  type VodProviderEpisode,
  type VodProviderNextEpisode,
  type VodProviderSeason,
  type VodProviderSeries,
  type VodProviderSeriesDetails,
  type VodProviderSeriesResponse,
} from "@/lib/services/vod-provider-service";

export type KeshetVodSeries = VodProviderSeries;
export type KeshetVodSeason = VodProviderSeason;
export type KeshetVodEpisode = VodProviderEpisode;
export type KeshetVodSeriesDetails = VodProviderSeriesDetails;
export type KeshetVodNextEpisode = VodProviderNextEpisode;
export type KeshetVodSeriesResponse = VodProviderSeriesResponse;

export const keshetVodService = createVodProviderService("/keshet-vod", "Keshet VOD");
