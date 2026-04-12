"use client";

import { useCallback, useRef, useState } from "react";
import Header from "@/components/Header";
import { useChannelsContext } from "./layout";
import ProgramGuide from "@/components/ProgramGuide";
import dynamic from "next/dynamic";
import { ChannelsFilters } from "@/components/channels-filters";
import { useFilteredChannels } from "@/hooks/useFilteredChannels";
import { Channel } from "@/lib/channels-data";

const VideoPlayer = dynamic(
    () => import("@/components/video-player").then(m => m.VideoPlayer),
    { ssr: false }
);

export default function TVGuidePage() {
    const { channels, refresh } = useChannelsContext();
    const playerRef = useRef<HTMLDivElement>(null);
    const [selectedChannel, setSelectedChannel] = useState<any>(null);
    const [isPlayerOpen, setIsPlayerOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const filteredChannels = useFilteredChannels(channels, searchQuery, selectedCategory);

    const handleProgramClick = (prog: any, ch: Channel, isLive: boolean) => {
        setSelectedChannel(ch);
        setIsPlayerOpen(true);
    };

      const handleChannelClick = (ch: Channel) => {
        setSelectedChannel(ch);
        setIsPlayerOpen(true);
    };

    const handleClose = () => {
        setIsPlayerOpen(false);
        setSelectedChannel(null);
    };

    const onResizeFull = () => {
        console.log("Toggling fullscreen mode");
        const el = playerRef.current?.classList;

        el?.toggle("player-overlay");
        el?.toggle("player-overlay-fullscreen");

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
                        onChannelClick={handleChannelClick}
                        onProgramClick={handleProgramClick}
                    />

                    {selectedChannel && (
                        <div ref={playerRef} className="player-overlay" dir="rtl">
                            <VideoPlayer
                                className="h-full w-full"
                                channel={selectedChannel}
                                onClose={handleClose}
                                onResize={onResizeFull}
                            />
                        </div>
                    )}
                </div>
            </main>

            <style jsx global>{`
                .player-overlay {
                    position: absolute;
                    margin-left: auto;
                    margin-right: auto;
                    width: 100%;
                    height: 100%;
                    z-index: 50;
                }

                .player-overlay-fullscreen {
                    position: fixed;
                    width: 99vw;
                    height: 99vh;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 50;
                }

                @media (min-width: 500px) {
                    .player-overlay {
                            width: clamp(400px, 40vw, 700px);
                            height: auto;
                            aspect-ratio: 16 / 9;
                            bottom: 20px;
                            right: 20px;
                    }
                }
            `}</style>
        </div>
    );
}