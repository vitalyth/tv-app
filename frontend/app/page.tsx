"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { categories, type Channel } from "@/lib/channels-data";
import { SidebarChannelList } from "@/components/sidebar-channel-list";
import { ChannelCard } from "@/components/channel-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "@/components/Header";
import { channelService } from "@/lib/services/channel-service";
import dynamic from "next/dynamic";
import useSWR from "swr";

// Load VideoPlayer only on client to avoid SSR issues
const VideoPlayer = dynamic(
  () => import("@/components/video-player").then((m) => m.VideoPlayer),
  { ssr: false }
);

// Fetcher
const fetchChannels = async (): Promise<Channel[]> => {
  return await channelService.getLiveChannels();
};

export default function TVChannelsPage() {
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // 🚀 SWR במקום useEffect
  const {
    data: channels = [],
    error,
    isLoading,
    mutate,
  } = useSWR("channels", fetchChannels, {
    refreshInterval: 60 * 1000, // כל 1 דקות
    revalidateOnFocus: true, // חוזר לטאב → רענון
    dedupingInterval: 10000, // מונע קריאות כפולות
    errorRetryCount: 3,
  });

  // Filtering
  const filteredChannels = useMemo(() => {
    const query = searchQuery.toLowerCase();

    return channels.filter((channel) => {
      const matchesSearch = channel.name.toLowerCase().includes(query);
      const matchesCategory =
        selectedCategory === "הכל" ||
        channel.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory, channels]);

  const handleSelectChannel = (channel: Channel) => {
    setSelectedChannel(channel);
    setIsMobileSidebarOpen(false);
  };

  const handleClose = () => setSelectedChannel(null);

  const toggleMobileSidebar = () =>
    setIsMobileSidebarOpen((prev) => !prev);

  // 🧠 רענון ידני (אם תרצה)
  const refreshNow = () => {
    mutate(); // fetch מחדש בלי flicker
  };

  // Grid view
  if (!selectedChannel) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />

        <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full lg:pt-16">
          {/* Search + filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6 lg:sticky lg:top-16 lg:z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="חפש ערוץ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 bg-card border-border"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={
                    selectedCategory === category ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className="whitespace-nowrap"
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {/* States */}
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">טוען ערוצים...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500 text-lg">
                שגיאה בטעינת הערוצים
              </p>
              <button onClick={refreshNow} className="mt-4 underline">
                נסה שוב
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredChannels.map((channel) => (
                  <ChannelCard
                    key={channel.id}
                    channel={channel}
                    isActive={false}
                    onClick={() => handleSelectChannel(channel)}
                  />
                ))}
              </div>

              {filteredChannels.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground text-lg">
                    לא נמצאו ערוצים
                  </p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    );
  }

  // Player view
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header
        onClose={handleClose}
        onToggleSidebar={toggleMobileSidebar}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden">
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-6xl">
              <VideoPlayer
                channel={selectedChannel}
                sourceChannels={channels}
                onClose={handleClose}
                onChannelChange={handleSelectChannel}
              />
            </div>
          </div>
        </main>

        <div className="hidden lg:flex h-full">
          <SidebarChannelList
            channels={filteredChannels}
            selectedChannel={selectedChannel}
            selectedCategory={selectedCategory}
            searchQuery={searchQuery}
            isCollapsed={isSidebarCollapsed}
            onSelectChannel={handleSelectChannel}
            onCategoryChange={setSelectedCategory}
            onSearchChange={setSearchQuery}
            onToggleCollapse={() =>
              setIsSidebarCollapsed((prev) => !prev)
            }
          />
        </div>

        {isMobileSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        <div
          className={`lg:hidden fixed top-0 left-0 h-screen z-50 transition-transform duration-300 ${
            isMobileSidebarOpen
              ? "translate-x-0"
              : "-translate-x-full"
          }`}
        >
          <SidebarChannelList
            channels={filteredChannels}
            selectedChannel={selectedChannel}
            selectedCategory={selectedCategory}
            searchQuery={searchQuery}
            onSelectChannel={handleSelectChannel}
            onCategoryChange={setSelectedCategory}
            onSearchChange={setSearchQuery}
            isCollapsed={true}
            onToggleCollapse={() => setIsMobileSidebarOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
