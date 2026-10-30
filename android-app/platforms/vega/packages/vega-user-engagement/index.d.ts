import type {KeplerTurboModule} from '@amazon-devices/keplerscript-turbomodule-api';

export interface TvAppUserEngagement extends KeplerTurboModule {
  startVideoEngagement(): boolean;
  stopVideoEngagement(): boolean;
  isSoftwareMultiViewAvailable(): boolean;
}

declare const module: TvAppUserEngagement;
export default module;
