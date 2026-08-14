import {
  createVodProviderService,
  type VodProviderEpisode,
  type VodProviderNextEpisode,
  type VodProviderSeason,
  type VodProviderSeries,
  type VodProviderSeriesDetails,
  type VodProviderSeriesResponse,
} from "@/lib/services/vod-provider-service";

export type I24VodSeries = VodProviderSeries;
export type I24VodSeason = VodProviderSeason;
export type I24VodEpisode = VodProviderEpisode;
export type I24VodSeriesDetails = VodProviderSeriesDetails;
export type I24VodNextEpisode = VodProviderNextEpisode;
export type I24VodSeriesResponse = VodProviderSeriesResponse;

export const i24VodService = createVodProviderService("/i24-vod", "i24 VOD");
