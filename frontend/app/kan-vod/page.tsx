"use client";

import { VodProviderListPage } from "@/components/vod-provider-list-page";
import { kanVodService } from "@/lib/services/kan-vod-service";

export default function KanVodPage() {
  return (
    <VodProviderListPage
      title="כאן VOD"
      providerPath="kan-vod"
      searchPlaceholder="חיפוש בכאן"
      service={kanVodService}
    />
  );
}
