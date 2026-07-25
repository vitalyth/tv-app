"use client";

import { VodProviderDetailsPage } from "@/components/vod-provider-details-page";
import { kanVodService } from "@/lib/services/kan-vod-service";

export default function KanVodDetailsPage() {
  return (
    <VodProviderDetailsPage
      config={{
        channelLogo: "/ch/kan.jpg",
        channelName: "כאן VOD",
        module: "kan-vod",
        providerPath: "kan-vod",
        providerTitle: "כאן VOD",
        referer: "https://www.kan.org.il/",
        service: kanVodService,
      }}
    />
  );
}
