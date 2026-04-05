"use client";

import { useEffect, useMemo, useState } from 'react'
import Header from "@/components/Header";
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Channel } from '@/lib/channels-data';
import { channelService } from '@/lib/services/channel-service';
import useSWR from 'swr';
import { channel } from 'diagnostics_channel';
import { SidebarChannelList } from '@/components/sidebar-channel-list';

// Load VideoPlayer only on client to avoid SSR issues
const VideoPlayer = dynamic(
    () => import("@/components/video-player").then((m) => m.VideoPlayer),
    { ssr: false }
);

const channelPage = () => {
    const router = useRouter();
    const params = useParams();

    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("הכל");
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    
    const fetchChannels = async (): Promise<Channel[]> => {
        return await channelService.getLiveChannels();
    };

    const handleClose = () => {
        router.push("/live");
    };

    const { data: channels = [], error, isLoading, mutate } = useSWR("channels", fetchChannels, {
        refreshInterval: 60 * 1000, // every 1 minute
        revalidateOnFocus: true, // refresh when returning to the tab
        dedupingInterval: 10000, // dumps multiple requests
        errorRetryCount: 3,
    });

    useEffect(() => {
        if (!channels?.length || !params?.id) return;

        const id = Array.isArray(params.id) ? params.id[0] : params.id;

        const channelbyId = channels.find(
            (c) => String(c.id) === String(id)
        );

        setSelectedChannel(channelbyId ?? null);

    }, [channels, params.id]);
  
    const toggleMobileSidebar = () => setIsMobileSidebarOpen((prev) => !prev);

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
        router.push(`/live/${channel.id}`);
        //setSelectedChannel(channel);
        //setIsMobileSidebarOpen(false);
    };
    
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
                        {selectedChannel && (
                            <VideoPlayer
                                channel={selectedChannel}
                                onClose={handleClose}
                            />
                        )}
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
                        isCollapsed={false}
                        onSelectChannel={handleSelectChannel}
                        onCategoryChange={setSelectedCategory}
                        onSearchChange={setSearchQuery}
                        onToggleCollapse={() => setIsMobileSidebarOpen(false)}
                    />
                </div>
            </div>
        </div>
    )
}

export default channelPage
