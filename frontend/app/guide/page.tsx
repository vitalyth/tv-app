"use client";

import { useCallback, useState } from "react";
import Header from "@/components/Header";
import { useChannelsContext } from "./layout";
import ProgramGuide from "@/components/ProgramGuide";
import dynamic from "next/dynamic";
import { ChannelsFilters } from "@/components/channels-filters";
import { useFilteredChannels } from "@/hooks/useFilteredChannels";

const VideoPlayer = dynamic(
    () => import("@/components/video-player").then(m => m.VideoPlayer),
    { ssr: false }
);

export default function TVGuidePage() {
    const { channels, refresh } = useChannelsContext();

    const [selectedChannel, setSelectedChannel] = useState<any>(null);
    const [isPlayerOpen, setIsPlayerOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("הכל");
    const filteredChannels = useFilteredChannels(channels, searchQuery, selectedCategory);

    const handleProgramClick = (prog: any, ch: any, isLive: boolean) => {
        console.log("program clicked:", prog, ch, isLive);

        setSelectedChannel(ch);
        setIsPlayerOpen(true);
    };

    const handleClose = () => {
        setIsPlayerOpen(false);
        setSelectedChannel(null);
    };

    const refreshNow = useCallback(() => {
        refresh();
    }, [refresh]);

    return (
        <div className="h-screen flex flex-col bg-background">
            <Header />

            <main className="flex-1 flex flex-col w-full px-4 py-4 overflow-hidden">

                <ChannelsFilters
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    onRefresh={refreshNow}
                />
                <div dir="ltr" className="relative flex-1 flex flex-col w-full overflow-hidden">
                    <ProgramGuide
                        channels={filteredChannels}
                        logoBasePath="/ch/"
                        onChannelClick={(ch) => console.log("channel clicked:", ch.name)}
                        onProgramClick={handleProgramClick}
                    />

                    {selectedChannel && (
                        <div className="absolute w-150 h-85 bottom-5 right-5 z-50" dir="rtl">
                            <VideoPlayer
                                className="h-full w-full"
                                channel={selectedChannel}
                                onClose={handleClose}
                            />
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}