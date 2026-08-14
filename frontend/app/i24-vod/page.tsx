"use client";

import { VodProviderListPage } from "@/components/vod-provider-list-page";
import { i24VodService } from "@/lib/services/i24-vod-service";

export default function I24VodPage() {
  return (
    <VodProviderListPage
      title="i24NEWS VOD"
      providerPath="i24-vod"
      searchPlaceholder="חיפוש ב-i24"
      service={i24VodService}
    />
  );
}
