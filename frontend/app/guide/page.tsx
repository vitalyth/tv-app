"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChannelsContext } from "@/context/channels-context";
import ProgramGuide from "@/components/ProgramGuide";
import { ChannelsFilters } from "@/components/channels-filters";
import { useFilteredChannels } from "@/hooks/useFilteredChannels";
import { Channel, Program } from "@/lib/channels-data";
import { channelService } from "@/lib/services/channel-service";
import { getPersistedCastChannelId } from "@/hooks/useGoogleCast";
import { useFloatingPlayer } from "@/context/floating-player-context";

export default function GuidePage() {
    const { channels, refresh } = useChannelsContext();
    const { currentChannel, play } = useFloatingPlayer();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [epgByChannel, setEpgByChannel] = useState<Record<string, Program[]>>({});

    const loadEpg = useCallback(() => {
        return channelService.getEpg()
            .then((epg) => {
                if (epg && typeof epg === "object") {
                    setEpgByChannel(epg as Record<string, Program[]>);
                }
            })
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        let cancelled = false;

        channelService.getEpg()
            .then((epg) => {
                if (!cancelled && epg && typeof epg === "object") {
                    setEpgByChannel(epg as Record<string, Program[]>);
                }
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, []);

    const channelsWithEpg = useMemo(
        () => channels.map((channel) => ({
            ...channel,
            programs: channel.tvgID ? epgByChannel[channel.tvgID] ?? channel.programs : channel.programs,
        })),
        [channels, epgByChannel]
    );

    const filteredChannels = useFilteredChannels(channelsWithEpg, searchQuery, selectedCategory);

    // Restore Cast session after page refresh:
    // When channels finish loading, check if there was an active Cast session
    // before the refresh. If so, reselect the channel so the Cast SDK can
    // resume the session automatically (SESSION_RESUMED fires in useGoogleCast).
    useEffect(() => {
        if (!channelsWithEpg.length || currentChannel) return;

        const restoredChannelId = getPersistedCastChannelId();
        if (!restoredChannelId) return;

        const channel = channelsWithEpg.find((ch) => ch.id === restoredChannelId);
        if (channel) {
            play(channel);
        }
    }, [channelsWithEpg, currentChannel, play]);

    const playChannel = useCallback((ch: Channel) => {
        play(ch);
    }, [play]);

    const handleProgramClick = useCallback((_program: Program, ch: Channel) => {
        playChannel(ch);
    }, [playChannel]);

    const handleChannelClick = useCallback((ch: Channel) => {
        playChannel(ch);
    }, [playChannel]);

    const refreshNow = useCallback(() => {
        refresh();
        loadEpg();
    }, [loadEpg, refresh]);

    return (
        <div className="h-full flex flex-col bg-background">
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
                        sourceChannels={channelsWithEpg}
                        logoBasePath="/ch/"
                        playingChannelId={currentChannel?.type === "vod" ? undefined : currentChannel?.id}
                        playingChannelIndex={currentChannel?.type === "vod" ? undefined : currentChannel?.index}
                        onChannelClick={handleChannelClick}
                        onProgramClick={handleProgramClick}
                    />
                </div>
            </main>
        </div>
    );
}
