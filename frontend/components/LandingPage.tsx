"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { channelService } from "@/lib/services/channel-service";
import { useVodRecentlyWatched } from "@/hooks/useVodRecentlyWatched";
import { useFloatingPlayer } from "@/context/floating-player-context";
import { ChannelCard } from "@/components/channel-card";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { type Channel, type VodChannel, type VodItem, type VodPlaybackMeta } from "@/lib/channels-data";

interface VodNode {
  name: string;
  module: string;
  mode: number;
  url: string;
  logo: string;
  moreData: string;
  description?: string;
}

const buildVodMeta = (item: VodItem, stack: VodNode[]): VodPlaybackMeta => {
  const channelNode = stack[0];
  const contentNodes = stack.slice(1).filter((node) => node.name && node.name.trim().length > 0);
  const seasonNode = [...contentNodes].reverse().find((node) => /^(עונה\b|Season\b)/.test(node.name));
  const programNode =
    contentNodes.find((node) => !/^(עונה\b|Season\b)/.test(node.name)) ||
    stack.find((node, index) => index > 0 && node.name && node.name.trim().length > 0) ||
    stack[1] ||
    stack[0];

  const explicitSeason = item.seasonName || item.season || seasonNode?.name;
  const seasonName = explicitSeason && explicitSeason !== programNode?.name ? explicitSeason : undefined;

  return {
    programName: item.programName || programNode?.name || item.name,
    seasonName,
    channelName: item.channelName || channelNode?.name || "VOD",
    episodeName: item.episodeName || item.title || item.name,
    episodeDescription: item.episodeDescription || item.description || item.plot,
    programDescription: item.programDescription || programNode?.description,
    programImage: item.programImage || programNode?.logo || item.logo,
    channelImage: item.channelImage || channelNode?.logo || item.logo,
    episodeImage: item.episodeImage || item.logo,
  };
};

const vodItemToChannel = (item: VodItem, stack: VodNode[]): Channel => {
  const vodMeta = buildVodMeta(item, stack);
  const titleParts = [vodMeta.channelName, vodMeta.programName].filter(Boolean);
  const subtitleParts = [vodMeta.seasonName, vodMeta.episodeName].filter(Boolean);

  return {
    id: item.id,
    index: 0,
    name: vodMeta.channelName,
    logo: vodMeta.channelImage || item.logo,
    category: "vod",
    channelID: item.url,
    module: item.module,
    mode: item.mode,
    linkDetails: {
      link: item.url,
    },
    type: "vod",
    programs: [],
    tvgID: "",
    url: item.url,
    moreData: item.moreData,
    playerLogo: vodMeta.channelImage || item.logo,
    playerTitle: titleParts.join(" · "),
    playerSubtitle: subtitleParts.join(" · "),
    vodMeta,
  };
};

const toVodChannel = (vodChannel: VodChannel): Channel => ({
  id: vodChannel.id,
  index: 0,
  name: vodChannel.name,
  logo: vodChannel.logo,
  category: "vod",
  channelID: vodChannel.url,
  module: vodChannel.module,
  mode: vodChannel.mode,
  linkDetails: {
    link: vodChannel.url,
  },
  type: "vod",
  programs: [],
  tvgID: "",
  url: vodChannel.url,
  moreData: "",
  playerLogo: vodChannel.logo,
  playerTitle: vodChannel.name,
  playerSubtitle: vodChannel.module,
});

const FeaturedChannelCard = ({
  channel,
  onPlay,
}: {
  channel: Channel;
  onPlay: () => void;
}) => {
  const subtitle = channel.playerSubtitle || channel.module || "VOD";

  return (
    <div
      className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 to-secondary/20 border-2 border-primary/30 hover:border-primary/60 transition-all duration-300 cursor-pointer"
      onClick={onPlay}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />

      <div className="relative p-6 h-72 flex flex-col justify-end">
        <div className="mb-4">
          <div className="w-24 h-24 rounded-xl bg-card/80 border border-border flex items-center justify-center overflow-hidden">
            <img
              src={`/ch/${channel.logo}`}
              alt={channel.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <h3 className="text-2xl font-bold text-white mb-2">{channel.name}</h3>
        <p className="text-sm text-primary font-semibold mb-3">{subtitle}</p>

        {channel.playerTitle && (
          <div className="mb-4 space-y-1">
            <p className="text-sm text-gray-300 line-clamp-2">{channel.playerTitle}</p>
            {channel.playerSubtitle && (
              <p className="text-sm text-gray-400 line-clamp-2">{channel.playerSubtitle}</p>
            )}
          </div>
        )}

        <Button className="w-full gap-2 bg-primary hover:bg-primary/90">
          <span>▶</span>
          <span>צפה עכשיו</span>
        </Button>
      </div>

      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
};

const LandingPage = () => {
  const router = useRouter();
  const { play } = useFloatingPlayer();
  const { recentItems } = useVodRecentlyWatched();
  const { data: vodChannels = [], isLoading } = useSWR(
    "vod-home-channels",
    () => channelService.getVodChannels(),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  const channels = useMemo(() => vodChannels.map(toVodChannel), [vodChannels]);
  const featuredChannels = useMemo(() => channels.slice(0, 3), [channels]);
  const trendingChannels = useMemo(() => {
    const shuffled = [...channels].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  }, [channels]);
  const recentVodChannels = useMemo(
    () => recentItems.map(({ item, stack }) => vodItemToChannel(item, stack)),
    [recentItems]
  );

  const handleChannelClick = useCallback(
    (channel: Channel) => {
      play(channel);
    },
    [play]
  );

  const handleSeeAllVod = () => {
    router.push("/vod");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 w-full">
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <p className="text-muted-foreground text-lg">טוען תוכן...</p>
          </div>
        ) : (
          <div className="space-y-12 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <section className="rounded-3xl bg-card border border-border p-8 shadow-sm">
              <div className="space-y-4">
                <h1 className="text-4xl font-bold">VOD במקום ה-Live</h1>
                <p className="max-w-3xl text-muted-foreground text-lg leading-8">
                  העמוד הראשי כעת מציג תוכן VOD ראשי, המלצות וקטעים שממשיכים לצפייה.
                  השימוש בעמוד Live הוסר מהזרימה הראשית.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <Button size="lg" className="gap-2" onClick={handleSeeAllVod}>
                    <span>🎬 כל ה-VOD</span>
                  </Button>
                </div>
              </div>
            </section>

            {featuredChannels.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-4 flex-col sm:flex-row">
                  <h2 className="text-3xl md:text-4xl font-bold">🎬 המלצות VOD</h2>
                  <Button variant="outline" size="sm" onClick={handleSeeAllVod} className="gap-1">
                    כל ה-VOD
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {featuredChannels.map((channel) => (
                    <FeaturedChannelCard
                      key={channel.id}
                      channel={channel}
                      onPlay={() => handleChannelClick(channel)}
                    />
                  ))}
                </div>
              </section>
            )}

            {recentVodChannels.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">📺 צפו לאחרונה</h2>
                  <Button variant="outline" size="sm" onClick={handleSeeAllVod} className="gap-1">
                    כל ה-VOD
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-4 min-w-max">
                    {recentVodChannels.map((channel) => (
                      <div
                        key={channel.id}
                        className="flex-shrink-0 w-40"
                        onClick={() => handleChannelClick(channel)}
                      >
                        <ChannelCard
                          channel={channel}
                          isActive={false}
                          onClick={() => handleChannelClick(channel)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {trendingChannels.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">🔥 מומלצים ב-VOD</h2>
                  <Button variant="outline" size="sm" onClick={handleSeeAllVod} className="gap-1">
                    כל ה-VOD
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {trendingChannels.map((channel) => (
                    <div key={channel.id} onClick={() => handleChannelClick(channel)}>
                      <ChannelCard
                        channel={channel}
                        isActive={false}
                        onClick={() => handleChannelClick(channel)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="py-8">
              <Button size="lg" className="w-full gap-2" onClick={handleSeeAllVod}>
                <span>📺</span>
                <span>כל ה-VOD</span>
              </Button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default LandingPage;
