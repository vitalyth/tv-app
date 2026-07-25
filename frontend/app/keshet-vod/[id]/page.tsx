"use client";

import { VodProviderDetailsPage } from "@/components/vod-provider-details-page";
import { keshetVodService } from "@/lib/services/keshet-vod-service";

export default function KeshetVodDetailsPage() {
  return (
    <VodProviderDetailsPage
      config={{
        channelLogo: "/ch/mako.png",
        channelName: "קשת VOD",
        module: "keshet-vod",
        providerPath: "keshet-vod",
        providerTitle: "קשת VOD",
        referer: "https://www.mako.co.il/",
        service: keshetVodService,
      }}
    />
  );
}
