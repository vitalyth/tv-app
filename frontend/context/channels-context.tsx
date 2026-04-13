"use client";

import { createContext, useContext } from "react";
import useSWR from "swr";
import { channelService } from "@/lib/services/channel-service";
import { Channel } from "@/lib/channels-data";

type ChannelsContextType = {
    channels: Channel[];
    isLoading: boolean;
    error: any;
    refresh: () => void;
};

const ChannelsContext = createContext<ChannelsContextType | null>(null);

export const useChannelsContext = () => {
    const ctx = useContext(ChannelsContext);

    if (!ctx) {
        throw new Error("useChannelsContext must be used inside ChannelsProvider");
    }

    return ctx;
};

export const ChannelsProvider = ({ children }: { children: React.ReactNode }) => {
    const fetchChannels = async (): Promise<Channel[]> => {
        return await channelService.getLiveChannels();
    };

    const {
        data: channels = [],
        error,
        isLoading,
        mutate
    } = useSWR("channels", fetchChannels, {
        refreshInterval: 60 * 1000,
        revalidateOnFocus: true,
        dedupingInterval: 10000,
        errorRetryCount: 3,
    });

    return (
        <ChannelsContext.Provider
            value={{
                channels,
                isLoading,
                error,
                refresh: mutate,
            }}
        >
            {children}
        </ChannelsContext.Provider>
    );
};