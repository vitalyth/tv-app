"use client";

import { ReactNode } from "react";
import { ChannelsProvider } from "@/context/channels-context";

export default function LiveLayout({ children }: { children: ReactNode }) {
    return (
        <ChannelsProvider>
            {children}
        </ChannelsProvider>
    );
}
