"use client";

import { useCallback, useMemo, useState } from 'react'
import Header from "@/components/Header";
import { ChannelCard } from '@/components/channel-card';
import { useRouter } from 'next/navigation';
import { useChannelsContext } from "@/context/channels-context";
import { useFilteredChannels } from "@/hooks/useFilteredChannels";
import { ChannelsFilters } from "@/components/channels-filters";
import { Channel } from '@/lib/channels-data';
import { CHANNEL_REGION_SECTIONS, getChannelRegion } from "@/lib/channel-regions";
import { PageMain } from "@/components/page-main";

const ChannelsList = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const { channels, isLoading, error, refresh } = useChannelsContext();
    const filteredChannels = useFilteredChannels(channels, searchQuery, selectedCategory);
    const groupedChannels = useMemo(
        () => CHANNEL_REGION_SECTIONS.map((section) => ({
            ...section,
            channels: filteredChannels.filter((channel) => getChannelRegion(channel) === section.value),
        })).filter((section) => section.channels.length > 0),
        [filteredChannels]
    );
    const router = useRouter();
    
    const refreshNow = useCallback(() => {
        return refresh();
    }, [refresh]);

    const handleSelectChannel = (channel: Channel) => {
        router.push(`/live/${channel.id}`);
    };
    
    return (
        <div className="flex min-h-dvh flex-col bg-background">
            <Header />
            <PageMain className="overflow-visible px-4 py-6">
                {/* Search + filters */}
                <ChannelsFilters
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    onRefresh={refreshNow}
                />

                {/* Channels grid */}
                {isLoading ? (
                <div className="text-center py-12">
                    <p className="text-muted-foreground">טוען ערוצים...</p>
                </div>
                ) : error ? (
                <div className="text-center py-12">
                    <p className="text-red-500 text-lg">
                        שגיאה בטעינת הערוצים
                    </p>
                    <button onClick={refreshNow} className="mt-4 underline">
                        נסה שוב
                    </button>
                </div>
                ) : (
                <>
                    <div className="space-y-8">
                        {groupedChannels.map((section) => (
                            <section key={section.value} aria-labelledby={`channels-${section.value}`}>
                                <div className="mb-3 flex items-center gap-3">
                                    <h2
                                        id={`channels-${section.value}`}
                                        className="text-lg font-bold text-foreground"
                                    >
                                        {section.label}
                                    </h2>
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                        {section.channels.length}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                                    {section.channels.map((channel) => (
                                        <ChannelCard
                                            key={channel.id}
                                            channel={channel}
                                            isActive={false}
                                            onClick={() => handleSelectChannel(channel)}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>

                    {filteredChannels.length === 0 && (
                        <div className="text-center py-12">
                        <p className="text-muted-foreground text-lg">
                            לא נמצאו ערוצים
                        </p>
                        </div>
                    )}
                </>
                )}
            </PageMain>
        </div>
    )
}

export default ChannelsList
