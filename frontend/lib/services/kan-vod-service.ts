import {
  createVodProviderService,
  type VodProviderEpisode,
  type VodProviderNextEpisode,
  type VodProviderSeason,
  type VodProviderSeries,
  type VodProviderSeriesDetails,
  type VodProviderSeriesResponse,
} from "@/lib/services/vod-provider-service";

export type KanVodSeries = VodProviderSeries;
export type KanVodSeason = VodProviderSeason;
export type KanVodEpisode = VodProviderEpisode;
export type KanVodSeriesDetails = VodProviderSeriesDetails;
export type KanVodNextEpisode = VodProviderNextEpisode;
export type KanVodSeriesResponse = VodProviderSeriesResponse;

export const kanVodService = createVodProviderService("/kan-vod", "Kan VOD");
