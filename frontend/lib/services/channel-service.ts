import { apiFetch } from "@/lib/api-client";

export const channelService = {
  getLiveChannels() {
    return apiFetch("/live_channels");
  },

  getEpg(params?: { start?: number; end?: number; q?: string }) {
    if (params?.start === undefined && params?.end === undefined && !params?.q) {
      return apiFetch("/epg");
    }

    const searchParams = new URLSearchParams();
    if (params.start !== undefined) {
      searchParams.set("start", String(params.start));
    }
    if (params.end !== undefined) {
      searchParams.set("end", String(params.end));
    }
    if (params.q?.trim()) {
      searchParams.set("q", params.q.trim());
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
    if (item?.streamEndpoint) {
      const endpoint = String(item.streamEndpoint).replace(/^\/api(?=\/)/, "");
      return apiFetch(endpoint);
    }

    if (item?.module === "reshet-vod") {
      const episodeId = item?.episodeId || item?.id || "";
      if (episodeId) {
        return apiFetch(`/reshet-vod/stream?episode_id=${encodeURIComponent(episodeId)}`);
      }
    }

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
