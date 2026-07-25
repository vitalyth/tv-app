"use client";

import { VodProviderListPage } from "@/components/vod-provider-list-page";
import { reshetVodService } from "@/lib/services/reshet-vod-service";

export default function ReshetVodPage() {
  return (
    <VodProviderListPage
      title="רשת VOD"
      providerPath="reshet-vod"
      searchPlaceholder="חיפוש ברשת"
      service={reshetVodService}
    />
  );
}
