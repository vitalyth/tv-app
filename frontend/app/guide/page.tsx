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
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const filteredChannels = useFilteredChannels(channels, searchQuery, selectedCategory);

    const handleProgramClick = (prog: any, ch: Channel, isLive: boolean) => {
        setSelectedChannel(ch);
    };

      const handleChannelClick = (ch: Channel) => {
        setSelectedChannel(ch);
    };

    const handleClose = () => {
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
                    position: fixed;
                    width: 94vw;
                    height: auto;
                    aspect-ratio: 16 / 9;
                    top: 90px;
                    left: 50%;
                    transform: translate(-50%);
                    z-index: 50;
                }

                .player-overlay-fullscreen {
                    position: fixed;
                    width: 99vw;
                    height: 99vh;
                    aspect-ratio: 16 / 9;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 50;
                }

                @media (min-width: 500px) {
                    .player-overlay {
                        position: absolute;
                        width: clamp(400px, 40vw, 700px);
                        bottom: 20px;
                        right: 20px;
                        z-index: 50;
                        top: auto;
                        left: auto;
                        transform: none;
                    }
                }
            `}</style>
        </div>
    );
}