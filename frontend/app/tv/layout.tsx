"use client";

import { useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { categories, type Channel } from "@/lib/channels-data";
import { SidebarChannelList } from "@/components/sidebar-channel-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "@/components/Header";
import { channelService } from "@/lib/services/channel-service";
import useSWR from "swr";
import { createContext, useContext } from "react";

// Context
const ChannelsContext = createContext<Channel[]>([]);
export const useChannels = () => useContext(ChannelsContext);

const fetchChannels = async (): Promise<Channel[]> => {
  return await channelService.getLiveChannels();
};

export default function TVLayout({ children,}: { children: React.ReactNode;}) {
    const router = useRouter();
    const params = useParams();
    
    const currentId =
        params && typeof params.id === "string"
        ? params.id
        : null;

    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("הכל");
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    const toggleMobileSidebar = () => setIsMobileSidebarOpen((prev) => !prev && currentId);

    const { data: channels = [], mutate } = useSWR("channels", fetchChannels);

    const filteredChannels = useMemo(() => {
        const query = searchQuery.toLowerCase();

        return channels.filter((channel) => {
        const matchesSearch = channel.name
            .toLowerCase()
            .includes(query);
        const matchesCategory =
            selectedCategory === "הכל" ||
            channel.category === selectedCategory;

        return matchesSearch && matchesCategory;
        });
    }, [searchQuery, selectedCategory, channels]);

    const handleSelectChannel = (channel: Channel) => {
        router.push(`/tv/${channel.id}`);
    };

    const handleClose = () => {
        router.push("/tv");
    };

    const refreshNow = () => mutate();

    const selectedChannel = useMemo(() => {
    return filteredChannels.find(
        (c) => String(c.id) === currentId
    ) || null;
    }, [filteredChannels, currentId]);

    return (
        <ChannelsContext.Provider value={filteredChannels}>
            <div className="h-screen flex flex-col bg-background overflow-hidden">

            {/* 🔝 Header */}
            <Header
                onClose={handleClose}
                onToggleSidebar={toggleMobileSidebar}
            />

            {/* 🔎 Filters (רק בלי ערוץ) */}
            {!currentId && (
                <div className="px-4 pt-4 pb-2 max-w-7xl mx-auto w-full">
                <div className="flex flex-col sm:flex-row gap-4">

                    <div className="relative flex-1 max-w-md">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" />
                    <Input
                        placeholder="חפש ערוץ..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pr-10"
                    />
                    </div>

                    <div className="flex gap-2 overflow-x-auto">
                    {categories.map((category) => (
                        <Button
                        key={category}
                        variant={
                            selectedCategory === category
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => setSelectedCategory(category)}
                        >
                        {category}
                        </Button>
                    ))}
                    </div>

                    <Button onClick={refreshNow} variant="outline">
                    רענן
                    </Button>
                </div>
                </div>
            )}

            {/* 🧱 Layout */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* 📺 MAIN */}
                <main
                className={`
                    ${
                    currentId
                        ? "flex-1 flex flex-col p-4 lg:p-6 overflow-hidden"
                        : "flex-1 px-4 py-6 max-w-7xl mx-auto w-full"
                    }
                `}
                >
                <div
                    className={
                    currentId
                        ? "flex-1 overflow-auto"
                        : "flex-1 flex items-center justify-center"
                    }
                >
                    {children}
                </div>
                </main>

                {/* 📚 SIDEBAR - DESKTOP */}
                {currentId && (
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
                )}

                {/* 📱 MOBILE SIDEBAR */}
                {currentId && isMobileSidebarOpen && (
                <>
                    {/* Overlay */}
                    <div
                    className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
                    onClick={() => setIsMobileSidebarOpen(false)}
                    />

                    {/* Sidebar */}
                    <div className="lg:hidden fixed top-0 left-0 h-screen w-[300px] z-50 shadow-xl transform transition-transform duration-300 ease-in-out translate-x-0">
                    <SidebarChannelList
                        channels={filteredChannels}
                        selectedChannel={selectedChannel}
                        selectedCategory={selectedCategory}
                        searchQuery={searchQuery}
                        isCollapsed={false}
                        onSelectChannel={(channel) => {
                            handleSelectChannel(channel);
                            setIsMobileSidebarOpen(false); // 🔥 סוגר אחרי בחירה
                        }}
                        onCategoryChange={setSelectedCategory}
                        onSearchChange={setSearchQuery}
                        onToggleCollapse={() =>
                        setIsMobileSidebarOpen(false)
                        }
                    />
                    </div>
                </>
                )}
            </div>
            </div>
        </ChannelsContext.Provider>
    );
}