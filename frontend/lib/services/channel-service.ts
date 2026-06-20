import { apiFetch } from "@/lib/api-client";

export const channelService = {
  getLiveChannels() {
    return apiFetch("/live_channels");
  },

  getEpg(params?: { start?: number; end?: number }) {
    if (params?.start === undefined && params?.end === undefined) {
      return apiFetch("/epg");
    }

    const searchParams = new URLSearchParams();
    if (params.start !== undefined) {
      searchParams.set("start", String(params.start));
    }
    if (params.end !== undefined) {
      searchParams.set("end", String(params.end));
    }

    return apiFetch(`/epg?${searchParams.toString()}`);
  },

  getVodChannels() {
    return apiFetch("/vod_channels");
  },

  getVodRecent() {
    return apiFetch("/vod_recent", { cache: "no-store" });
  },

  getVodItems(params: {
    module: string;
    mode: number;
    url?: string;
    name?: string;
    iconimage?: string;
    moreData?: string;
  }) {
    const searchParams = new URLSearchParams({
      module: params.module,
      mode: String(params.mode),
      url: params.url || "",
      name: params.name || "",
      iconimage: params.iconimage || "",
      moreData: params.moreData || "",
    });

    return apiFetch(`/vod_items?${searchParams.toString()}`);
  },

  getVodStream(item: any) {
    return apiFetch("/vod_stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(item),
    });
  },

  getLiveChannel(channel: any) {
    const endpoint = channel?.linkDetails?.vpn ? "/v/live_channel" : "/live_channel";

    return apiFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(channel),
    });
  },
};
