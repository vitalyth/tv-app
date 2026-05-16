"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useChannelsContext } from "@/context/channels-context";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { useFloatingPlayer } from "@/context/floating-player-context";
import Header from "@/components/Header";
import { ChannelCard } from "@/components/channel-card";
import { Channel, Program } from "@/lib/channels-data";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

// Helper component for featured channel card
const FeaturedChannelCard = ({
  channel,
  onPlay,
}: {
  channel: Channel;
  onPlay: () => void;
}) => {
  // Get the current program based on system time
  const getCurrentProgram = (): Program | undefined => {
    if (!channel.programs || channel.programs.length === 0) {
      return undefined;
    }

    const now = Date.now() / 1000;
    return channel.programs.find(
      (prog) => prog.start <= now && prog.end >= now
    );
  };

  const currentProgram = getCurrentProgram();

  return (
    <div
      className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 to-secondary/20 border-2 border-primary/30 hover:border-primary/60 transition-all duration-300 cursor-pointer"
      onClick={onPlay}
    >
      {/* Background image or gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />

      {/* Content */}
      <div className="relative p-6 h-72 flex flex-col justify-end">
        {/* Channel logo */}
        <div className="mb-4">
          <div className="w-24 h-24 rounded-xl bg-card/80 border border-border flex items-center justify-center overflow-hidden">
            <img
              src={`/ch/${channel.logo}`}
              alt={channel.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Channel name */}
        <h3 className="text-2xl font-bold text-white mb-2">
          {channel.name}
        </h3>

        {/* Current program */}
        {currentProgram && (
          <div className="mb-4 space-y-1">
            <p className="text-sm text-primary font-semibold">
              עכשיו משודר
            </p>
            <p className="text-lg font-semibold text-white line-clamp-2">
              {currentProgram.name}
            </p>
            {currentProgram.description && (
              <p className="text-sm text-gray-300 line-clamp-2">
                {currentProgram.description}
              </p>
            )}
          </div>
        )}

        {/* Play button */}
        <Button className="w-full gap-2 bg-primary hover:bg-primary/90">
          <span>▶</span>
          <span>צפה עכשיו</span>
        </Button>
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
};

const LandingPage = () => {
  const { channels, isLoading } = useChannelsContext();
  const { recentlyViewed } = useRecentlyViewed(channels);
  const { play } = useFloatingPlayer();
  const router = useRouter();
  const [categories, setCategories] = useState<string[]>([]);

  // Extract unique categories
  useEffect(() => {
    if (channels.length > 0) {
      const uniqueCategories = Array.from(
        new Set(channels.map((ch) => ch.category))
      ).filter(Boolean);
      setCategories(uniqueCategories);
    }
  }, [channels]);

  const handleChannelClick = useCallback(
    (channel: Channel) => {
      play(channel);
    },
    [play]
  );

  const handleSeeAllLive = () => {
    router.push("/live");
  };

  const handleSeeAllGuide = () => {
    router.push("/guide");
  };

  const handleCategoryClick = (category: string) => {
    router.push(`/live?category=${encodeURIComponent(category)}`);
  };

  // Get featured programs (first 3 channels with interesting programs)
  const featuredChannels = useMemo(
    () =>
      channels
        .filter((ch) => ch.programs && ch.programs.length > 0)
        .slice(0, 3),
    [channels]
  );

  // Get trending (random selection of channels)
  const trendingChannels = useMemo(() => {
    const shuffled = [...channels].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  }, [channels]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header title="דף הבית" />

      <main className="flex-1 w-full">
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <p className="text-muted-foreground text-lg">טוען תוכן...</p>
          </div>
        ) : (
          <div className="space-y-12 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            {/* Featured Section */}
            {featuredChannels.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl md:text-4xl font-bold">
                    🎬 שידורים מעניינים כרגע
                  </h2>
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

            {/* Recently Viewed Section */}
            {recentlyViewed.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">📺 נצפו לאחרונה</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSeeAllLive}
                    className="gap-1"
                  >
                    הצג הכל
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-4 min-w-max">
                    {recentlyViewed.map((channel) => (
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

            {/* Trending Section */}
            {trendingChannels.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">🔥 מומלץ</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSeeAllGuide}
                    className="gap-1"
                  >
                    מדריך מלא
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {trendingChannels.map((channel) => (
                    <div
                      key={channel.id}
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
              </section>
            )}

            {/* Categories Section */}
            {categories.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-2xl font-bold">📂 קטגוריות</h2>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => handleCategoryClick(category)}
                      className="p-4 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-secondary/50 transition-all duration-200 text-center font-semibold text-foreground hover:text-primary"
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* All Channels Shortcut */}
            <section className="py-8">
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={handleSeeAllLive}
              >
                <span>📺</span>
                <span>כל הערוצים</span>
              </Button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default LandingPage;
