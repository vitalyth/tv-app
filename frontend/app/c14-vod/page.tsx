"use client";

import { VodProviderListPage } from "@/components/vod-provider-list-page";
import { c14VodService } from "@/lib/services/c14-vod-service";

export default function C14VodPage() {
  return (
    <VodProviderListPage
      title="ערוץ 14 VOD"
      providerPath="c14-vod"
      searchPlaceholder="חיפוש בערוץ 14"
      service={c14VodService}
    />
  );
}
