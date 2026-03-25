import { apiFetch } from "@/lib/api-client";

export const channelService = {
  getLiveChannels() {
    return apiFetch("/live_channels");
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