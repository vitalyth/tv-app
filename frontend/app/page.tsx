"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { categories, type Channel } from "@/lib/channels-data";
import { SidebarChannelList } from "@/components/sidebar-channel-list";
import { ChannelCard } from "@/components/channel-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "@/components/Header";
import { channelService } from "@/lib/services/channel-service";
import dynamic from "next/dynamic";

// Load VideoPlayer only on client to avoid SSR issues
const VideoPlayer = dynamic(
  () => import("@/components/video-player").then((m) => m.VideoPlayer),
  { ssr: false }
);

export default function TVChannelsPage() {
  // Selected channel state (null = grid view)
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  // UI states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("הכל");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Data states
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true); // start true to prevent flicker
  const [error, setError] = useState<string | null>(null);

  // Fetch channels with retry support and cleanup protection
  const loadChannels = useCallback(() => {
    let isMounted = true;

    setIsLoading(true);
    setError(null);

    channelService
      .getLiveChannels()
      .then((data: Channel[]) => {
        if (!isMounted) return;
        setChannels(data);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load channels:", err);
        setError("שגיאה בטעינת הערוצים");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // Cleanup to avoid setting state after unmount
    return () => {
      isMounted = false;
    };
  }, []);

  // Initial load
  useEffect(() => {
    const cleanup = loadChannels();
    return cleanup;
  }, [loadChannels]);

  // Filter channels by search and category
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

  const handleClose = () => {
    setSelectedChannel(null);
  };

  const toggleMobileSidebar = () => {
    setIsMobileSidebarOpen((prev) => !prev);
  };

  // Grid view (no channel selected)
  if (!selectedChannel) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />

        <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
          {/* Search and category filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
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

          {/* Loading / Error / Success handling */}
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">טוען ערוצים...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500 text-lg">{error}</p>
              <button onClick={loadChannels} className="mt-4 underline">
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

              {/* Empty state shown only after loading */}
              {filteredChannels.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground text-lg">
                    לא נמצאו ערוצים
                  </p>
                  <p className="text-muted-foreground text-sm mt-2">
                    נסה לחפש משהו אחר
                  </p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    );
  }

  // Player view (channel selected)
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header
        onClose={handleClose}
        onToggleSidebar={toggleMobileSidebar}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Video player area */}
        <main className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden">
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-6xl">
              <VideoPlayer
                channel={selectedChannel}
                onClose={handleClose}
              />
            </div>
          </div>
        </main>

        {/* Desktop sidebar */}
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

        {/* Mobile overlay */}
        {isMobileSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Mobile sidebar */}
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
            isCollapsed={false}
            onSelectChannel={handleSelectChannel}
            onCategoryChange={setSelectedCategory}
            onSearchChange={setSearchQuery}
            onToggleCollapse={() => setIsMobileSidebarOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
