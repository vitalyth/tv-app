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

            {/* ✅ FULLSCREEN PLAYER */}
            <Dialog open={isPlayerOpen} onOpenChange={(open) => !open && handleClose()}>
                <DialogContent
                    className="
                        w-[80vw]! h-[80vh]!
                        max-w-none!
                        top-1/2! left-1/2!
                        translate-x-[-50%]! translate-y-[-50%]!
                        p-0!
                        bg-black
                        flex items-center justify-center
                    "
                >
                    {selectedChannel && (
                        <div className="w-full h-full flex items-center justify-center">

                            {/* מרכז + יחס תקין */}
                            <div className="w-full max-w-300 aspect-video">
                                <VideoPlayer
                                    channel={selectedChannel}
                                    onClose={handleClose}
                                />
                            </div>

                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}