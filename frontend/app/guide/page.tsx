"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { useChannelsContext } from "./layout";
import ProgramGuide from "@/components/ProgramGuide";
import dynamic from "next/dynamic";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const VideoPlayer = dynamic(
    () => import("@/components/video-player").then(m => m.VideoPlayer),
    { ssr: false }
);

export default function TVGuidePage() {
    const { channels } = useChannelsContext();

    const [selectedChannel, setSelectedChannel] = useState<any>(null);
    const [isPlayerOpen, setIsPlayerOpen] = useState(false);

    const handleProgramClick = (prog: any, ch: any, isLive: boolean) => {
        console.log("program clicked:", prog, ch, isLive);

        setSelectedChannel(ch);
        setIsPlayerOpen(true);
    };

    const handleClose = () => {
        setIsPlayerOpen(false);
        setSelectedChannel(null);
    };

    return (
        <div className="h-screen flex flex-col bg-background">
            <Header />

            <main className="flex-1 flex flex-col w-full px-4 py-4 overflow-hidden" dir="ltr">
                <ProgramGuide
                    channels={channels}
                    logoBasePath="/ch/"
                    onChannelClick={(ch) => console.log("channel clicked:", ch.name)}
                    onProgramClick={handleProgramClick}
                />
            </main>

            {selectedChannel && (
                <div className="absolute w-150 h-7! top-10 right-10 flex items-center justify-center z-50">

                    {/* מרכז + יחס תקין */}
                    <div className="absolute w-full h-full aspect-video">
                        <VideoPlayer
                            className="h-100 w-150 object-contain"
                            channel={selectedChannel}
                            onClose={handleClose}
                        />
                    </div>

                </div>
            )}
        </div>
    );
}