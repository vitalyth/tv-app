export type TvPlatformId = 'android-tv' | 'kepler';

export interface TvPlatform {
  id: TvPlatformId;
  displayName: string;
  packageFormat: 'apk' | 'vpkg';
}
