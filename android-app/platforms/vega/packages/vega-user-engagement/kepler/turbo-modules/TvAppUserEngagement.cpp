#include "TvAppUserEngagement.h"

#include <apmf/iface/com/amazon/apmf/BaseError.h>
#include <apmf/iface/com/amazon/apmf/DeviceError.h>
#include <apmf/iface/com/amazon/apmf/NotSupportedError.h>

using apmf::iface::com::amazon::kepler::user_engagement::IKeplerUserEngagementModuleV2;
using apmf::iface::com::amazon::kepler::user_engagement::IUserEngagement;

namespace tvapp {
namespace {
static constexpr apmf::StringView kUserEngagementComponent{
    "/com.amazon.kepler.user_engagement.user_engagement_module"};
}

TvAppUserEngagement::TvAppUserEngagement()
    : TM_API_NAMESPACE::KeplerTurboModule("TvAppUserEngagement") {}

void TvAppUserEngagement::aggregateMethods(
    TM_API_NAMESPACE::MethodAggregator<TM_API_NAMESPACE::KeplerTurboModule>& methodAggregator)
    const noexcept {
  methodAggregator.addMethod(
      "startVideoEngagement", 0, &TvAppUserEngagement::startVideoEngagement);
  methodAggregator.addMethod(
      "stopVideoEngagement", 0, &TvAppUserEngagement::stopVideoEngagement);
}

apmf::Ptr<IUserEngagement> TvAppUserEngagement::getVideoEngagement() {
  if (videoEngagement_ != nullptr) {
    return videoEngagement_;
  }

  auto module = apmf::GetProcessObject()
                    ->getComponent(kUserEngagementComponent)
                    .TryQueryInterface<IKeplerUserEngagementModuleV2>();
  if (module == nullptr) {
    return nullptr;
  }

  videoEngagement_ = module->makeVideoPlaybackUserEngagement();
  return videoEngagement_;
}

bool TvAppUserEngagement::startVideoEngagement() {
  try {
    auto engagement = getVideoEngagement();
    if (engagement == nullptr) {
      return false;
    }
    engagement->start();
    return true;
  } catch (const apmf::BaseError&) {
    return false;
  } catch (...) {
    return false;
  }
}

bool TvAppUserEngagement::stopVideoEngagement() {
  try {
    auto engagement = getVideoEngagement();
    if (engagement == nullptr) {
      return false;
    }
    engagement->stop();
    return true;
  } catch (const apmf::BaseError&) {
    return false;
  } catch (...) {
    return false;
  }
}
}  // namespace tvapp
