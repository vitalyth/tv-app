import { apiFetch } from "@/lib/api-client";

export const channelService = {
  getLiveChannels() {
    return apiFetch("/live_channels");
  },

  getVodChannels() {
    return apiFetch("/vod_channels");
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
    return apiFetch("/live_channel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(channel),
    });
  },
};
