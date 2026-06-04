"use client";

import { useCallback, useState } from 'react'
import Header from "@/components/Header";
import { ChannelCard } from '@/components/channel-card';
import { useRouter } from 'next/navigation';
import { useChannelsContext } from "@/context/channels-context";
import { useFilteredChannels } from "@/hooks/useFilteredChannels";
import { ChannelsFilters } from "@/components/channels-filters";
import { Channel } from '@/lib/channels-data';
import { PageMain } from "@/components/page-main";

const ChannelsList = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const { channels, isLoading, error, refresh } = useChannelsContext();
    const filteredChannels = useFilteredChannels( channels, searchQuery, selectedCategory );
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {filteredChannels.map((channel) => (
                            <ChannelCard
                                key={channel.id}
                                channel={channel}
                                isActive={false}
                                onClick={() => handleSelectChannel(channel)}
                            />
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
