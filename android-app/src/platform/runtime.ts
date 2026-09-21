import {Platform} from 'react-native';
import type {TvPlatform} from './types';

export const tvPlatform: TvPlatform =
  String(Platform.OS) === 'kepler'
    ? {id: 'kepler', displayName: 'Fire TV / Vega OS (Kepler)', packageFormat: 'vpkg'}
    : {id: 'android-tv', displayName: 'Google TV / Android TV', packageFormat: 'apk'};
