"use client";

import { VodProviderDetailsPage } from "@/components/vod-provider-details-page";
import { reshetVodService } from "@/lib/services/reshet-vod-service";

export default function ReshetVodDetailsPage() {
  return (
    <VodProviderDetailsPage
      config={{
        channelLogo: "/ch/13.jpg",
        channelName: "רשת VOD",
        module: "reshet-vod",
        providerPath: "reshet-vod",
        providerTitle: "רשת VOD",
        referer: "https://13tv.co.il/",
        service: reshetVodService,
      }}
    />
  );
}
