import useSWR from "swr";
import { type Channel } from "@/lib/channels-data";
import { channelService } from "@/lib/services/channel-service";

export type RadioNowPlaying = {
  title: string;
  detail?: string | null;
};

export function radioNowPlayingText(nowPlaying?: RadioNowPlaying | null) {
  return [nowPlaying?.title || "אין מידע", nowPlaying?.detail]
    .filter(Boolean)
    .join(" · ");
}

export function useRadioNowPlaying(channel?: Channel | null) {
  const activeRadioStationId = channel?.type === "radio" && channel.id ? channel.id : null;

  return useSWR<RadioNowPlaying>(
    activeRadioStationId ? ["radio-now-playing", activeRadioStationId] : null,
    ([, channelId]: [string, string]) => channelService.getRadioNowPlaying(channelId),
    {
      refreshInterval: 10 * 1000,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
    },
  );
}
