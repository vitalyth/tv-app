declare const require: (name: string) => any;

export const softwareMultiViewAvailable: boolean = (() => {
  try {
    const {
      TurboModuleRegistry,
    } = require('@amazon-devices/keplerscript-turbomodule-api');
    return (
      TurboModuleRegistry.get(
        'TvAppUserEngagement',
      )?.isSoftwareMultiViewAvailable?.() === true
    );
  } catch {
    return false;
  }
})();
