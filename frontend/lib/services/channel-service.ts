import { apiFetch } from "@/lib/api-client";

const VOD_STREAM_CACHE_TTL_MS = 3000;

const vodStreamInFlight = new Map<string, Promise<any>>();
const vodStreamCache = new Map<string, { expiresAt: number; data: any }>();

const dedupeVodStreamRequest = (key: string, request: () => Promise<any>) => {
  const cached = vodStreamCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data);
  }

  const inFlight = vodStreamInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = request()
    .then((data) => {
      vodStreamCache.set(key, {
        data,
        expiresAt: Date.now() + VOD_STREAM_CACHE_TTL_MS,
      });
      return data;
    })
    .finally(() => {
      vodStreamInFlight.delete(key);
    });

  vodStreamInFlight.set(key, promise);
  return promise;
};

export const channelService = {
  getLiveChannels() {
    return apiFetch("/live_channels");
  },

  getRadioChannels() {
    return apiFetch("/radio_channels");
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
      return dedupeVodStreamRequest(endpoint, () => apiFetch(endpoint));
    }

    if (item?.module === "reshet-vod") {
      const episodeId = item?.episodeId || item?.id || "";
      if (episodeId) {
        const endpoint = `/reshet-vod/stream?episode_id=${encodeURIComponent(episodeId)}`;
        return dedupeVodStreamRequest(endpoint, () => apiFetch(endpoint));
      }
    }

    const key = `/vod_stream:${item?.module || ""}:${item?.episodeId || item?.id || item?.url || ""}`;
    return dedupeVodStreamRequest(key, () => apiFetch("/vod_stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(item),
    }));
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
