import {
  createVodProviderService,
  type VodProviderEpisode,
  type VodProviderNextEpisode,
  type VodProviderSeason,
  type VodProviderSeries,
  type VodProviderSeriesDetails,
  type VodProviderSeriesResponse,
} from "@/lib/services/vod-provider-service";

export type C14VodSeries = VodProviderSeries;
export type C14VodSeason = VodProviderSeason;
export type C14VodEpisode = VodProviderEpisode;
export type C14VodSeriesDetails = VodProviderSeriesDetails;
export type C14VodNextEpisode = VodProviderNextEpisode;
export type C14VodSeriesResponse = VodProviderSeriesResponse;

export const c14VodService = createVodProviderService("/c14-vod", "C14 VOD");
