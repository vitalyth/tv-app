"use client";

import { VodProviderListPage } from "@/components/vod-provider-list-page";
import { keshetVodService } from "@/lib/services/keshet-vod-service";

export default function KeshetVodPage() {
  return (
    <VodProviderListPage
      title="קשת VOD"
      providerPath="keshet-vod"
      searchPlaceholder="חיפוש בקשת"
      service={keshetVodService}
    />
  );
}
