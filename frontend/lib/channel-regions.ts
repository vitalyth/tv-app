import type { Channel } from "@/lib/channels-data";

export type ChannelRegionFilter = "" | "israel" | "local" | "other";
export type ChannelRegion = Exclude<ChannelRegionFilter, "">;

export const CHANNEL_REGION_SECTIONS: { value: ChannelRegion; label: string }[] = [
  { value: "israel", label: "ישראלים" },
  { value: "local", label: "מקומיים" },
  { value: "other", label: "אחרים" },
];

const LOCAL_CHANNEL_IDS = new Set([
  "cbs_news_boston",
  "nbc10_boston",
  "wcvb_boston",
  "boston25",
  "gbh_boston",
]);

const OTHER_CHANNEL_IDS = new Set(["cnn", "ftv"]);

export function getChannelRegion(channel: Channel): ChannelRegion {
  const channelId = channel.channelID || channel.id;

  if (LOCAL_CHANNEL_IDS.has(channelId)) {
    return "local";
  }

  if (OTHER_CHANNEL_IDS.has(channelId)) {
    return "other";
  }

  return "israel";
}
