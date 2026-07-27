"use client";

import { VodProviderDetailsPage } from "@/components/vod-provider-details-page";
import { i24VodService } from "@/lib/services/i24-vod-service";

export default function I24VodDetailsPage() {
  return (
    <VodProviderDetailsPage
      config={{
        channelLogo: "/ch/i24news.png",
        channelName: "i24NEWS VOD",
        module: "i24-vod",
        providerPath: "i24-vod",
        providerTitle: "i24NEWS VOD",
        referer: "https://www.i24news.tv/",
        service: i24VodService,
      }}
    />
  );
}
