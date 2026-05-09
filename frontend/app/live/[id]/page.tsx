"use client";

import { useEffect, useState } from 'react'
import Header from "@/components/Header";
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Channel } from '@/lib/channels-data';
import { SidebarChannelList } from '@/components/sidebar-channel-list';
import { useChannelsContext } from "@/context/channels-context";
import { useFilteredChannels } from '@/hooks/useFilteredChannels';

// Load VideoPlayer only on client to avoid SSR issues
const VideoPlayer = dynamic(
    () => import("@/components/video-player").then((m) => m.VideoPlayer), { ssr: false }
);

const channelPage = () => {
    const router = useRouter();
    const params = useParams();

    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        if (typeof window !== "undefined") {
            const stored = sessionStorage.getItem("sidebar-collapsed");
            return stored === "true";
        }
        return false;
    });

    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const { channels } = useChannelsContext();
    const filteredChannels = useFilteredChannels( channels, searchQuery, selectedCategory );
    
    const handleClose = () => {
        router.push("/live");
    };

    useEffect(() => {
        sessionStorage.setItem("sidebar-collapsed", String(isSidebarCollapsed));
    }, [isSidebarCollapsed]);


    useEffect(() => {
        if (!channels?.length || !params?.id) return;

        const id = Array.isArray(params.id) ? params.id[0] : params.id;

        const channelbyId = channels.find(
            (c) => String(c.id) === String(id)
        );

        setSelectedChannel(channelbyId ?? null);

    }, [channels, params.id]);
  
    const toggleMobileSidebar = () => setIsMobileSidebarOpen((prev) => !prev);

    const handleSelectChannel = (channel: Channel) => {
        router.push(`/live/${channel.id}`);
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
                                className="w-full h-[70vh]"
                                channel={selectedChannel}
                                sourceChannels={channels}
                                onClose={handleClose}
                                onChannelChange={handleSelectChannel}
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
