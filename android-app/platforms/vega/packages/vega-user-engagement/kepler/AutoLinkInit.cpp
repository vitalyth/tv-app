#include "turbo-modules/TvAppUserEngagement.h"

#include <Kepler/turbomodule/KeplerTurboModuleRegistration.h>

extern "C" {
__attribute__((visibility("default"))) void autoLinkKeplerTurboModulesV1() noexcept {
  using namespace tvapp;
  KEPLER_REGISTER_TURBO_MODULE(TvAppUserEngagement);
}
}
