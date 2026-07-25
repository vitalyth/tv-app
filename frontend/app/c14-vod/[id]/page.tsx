"use client";

import { VodProviderDetailsPage } from "@/components/vod-provider-details-page";
import { c14VodService } from "@/lib/services/c14-vod-service";

export default function C14VodDetailsPage() {
  return (
    <VodProviderDetailsPage
      config={{
        channelLogo: "/ch/14tv.png",
        channelName: "ערוץ 14 VOD",
        module: "c14-vod",
        providerPath: "c14-vod",
        providerTitle: "ערוץ 14 VOD",
        referer: "https://vod.c14.co.il/",
        service: c14VodService,
      }}
    />
  );
}
