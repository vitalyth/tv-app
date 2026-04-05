"use client";

import { useState } from 'react'
import Header from "@/components/Header";
import { Search } from "lucide-react";
import { categories, Channel } from "@/lib/channels-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChannelCard } from '@/components/channel-card';
import { useRouter } from 'next/navigation';
import { useChannelsContext } from "@/hooks/useChannelsContext";
import { useFilteredChannels } from "@/hooks/useFilteredChannels";

const ChannelsList = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("הכל");
    const { channels, isLoading, error, refresh } = useChannelsContext();
    const filteredChannels = useFilteredChannels( channels, searchQuery, selectedCategory );
    const router = useRouter();
    
    const refreshNow = () => {
        refresh(); 
    };

    const handleSelectChannel = (channel: Channel) => {
        router.push(`/live/${channel.id}`);
    };
    
    return (
        <div className="min-h-screen flex flex-col bg-background">
            <Header />
            <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
                {/* Search + filters */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1 max-w-md">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="חפש ערוץ..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pr-10 bg-card border-border"
                    />
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {categories.map((category) => (
                        <Button
                        key={category}
                        variant={
                            selectedCategory === category ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setSelectedCategory(category)}
                        className="whitespace-nowrap"
                        >
                        {category}
                        </Button>
                    ))}
                    </div>

                    {/* reload channels */}
                    <Button onClick={refreshNow} variant="outline">
                    רענן
                    </Button>
                </div>

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
            </main>
        </div>
    )
}

export default ChannelsList
