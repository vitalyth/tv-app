"use client";

import { ReactNode } from "react";
import { ChannelsProvider } from "@/context/channels-context";
import "@/styles/video-player.css";

export default function LiveLayout({ children }: { children: ReactNode }) {
    return (
        <ChannelsProvider>
            {children}
        </ChannelsProvider>
    );
}
