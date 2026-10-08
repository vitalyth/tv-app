#ifndef TV_APP_USER_ENGAGEMENT_H
#define TV_APP_USER_ENGAGEMENT_H

#include "Kepler/turbomodule/KeplerTurboModule.h"

#include <apmf/iface/com/amazon/kepler/user_engagement/IKeplerUserEngagementModuleV2.h>
#include <apmf/iface/com/amazon/kepler/user_engagement/IUserEngagement.h>
#include <apmf/process.h>
#include <apmf/ptr.h>
#include <apmf/string_view.h>

#define TM_API_NAMESPACE com::amazon::kepler::turbomodule

namespace tvapp {
class TvAppUserEngagement : public TM_API_NAMESPACE::KeplerTurboModule {
 public:
  TvAppUserEngagement();

  void aggregateMethods(
      TM_API_NAMESPACE::MethodAggregator<TM_API_NAMESPACE::KeplerTurboModule>& methodAggregator)
      const noexcept;

  bool startVideoEngagement();
  bool stopVideoEngagement();

 private:
  apmf::Ptr<apmf::iface::com::amazon::kepler::user_engagement::IUserEngagement>
  getVideoEngagement();

  apmf::Ptr<apmf::iface::com::amazon::kepler::user_engagement::IUserEngagement>
      videoEngagement_;
};
}  // namespace tvapp

#endif  // TV_APP_USER_ENGAGEMENT_H
