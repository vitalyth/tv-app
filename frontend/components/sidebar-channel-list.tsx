"use client"

import { Search, Filter, ChevronLeft, ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type Channel, categories } from "@/lib/channels-data"
import ProgramDisplay from "@/components/program-display"
import { useEffect, useLayoutEffect, useRef } from "react"

interface SidebarChannelListProps {
    channels: Channel[]
    selectedChannel: Channel | null
    selectedCategory: string
    searchQuery: string
    isCollapsed: boolean
    onSelectChannel: (channel: Channel) => void
    onCategoryChange: (category: string) => void
    onSearchChange: (query: string) => void
    onToggleCollapse: () => void
}

export const SidebarChannelList = ({
    channels,
    selectedChannel,
    selectedCategory,
    searchQuery,
    isCollapsed,
    onSelectChannel,
    onCategoryChange,
    onSearchChange,
    onToggleCollapse,
}: SidebarChannelListProps) => {

    const scrollRef = useRef<HTMLDivElement>(null);

    // Restore scroll position on mount and save on unmount
    useLayoutEffect(() => {
        const saved = sessionStorage.getItem("sidebar-scroll");

        if (scrollRef.current && saved) {
            scrollRef.current.scrollTop = Number(saved);
        }
    }, []);

    // Save scroll position on unmount
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const handler = () => {
            sessionStorage.setItem("sidebar-scroll", String(el.scrollTop));
        };

        el.addEventListener("scroll", handler);
        return () => el.removeEventListener("scroll", handler);
    }, []);

    // Scroll selected channel into view when it changes
    if (isCollapsed) {
        return (
            <aside className="w-16 h-full bg-card border-l border-border flex flex-col items-center py-4 gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleCollapse}
                    className="mb-4"
                >
                    <ChevronRight className="w-4 h-4" />
                </Button>
                <div ref={scrollRef} className="flex-1 w-full overflow-y-auto styled-scrollbar">
                    <div className="flex flex-col items-center gap-2 px-2">
                        {channels.map((channel) => (
                            <button
                                key={channel.id}
                                onClick={() => onSelectChannel(channel)}
                                className={cn(
                                    "w-12 h-12 rounded-lg flex items-center justify-center transition-all",
                                    "bg-secondary border border-border hover:border-primary/50",
                                    selectedChannel?.id === channel.id && "border-primary bg-primary/20"
                                )}
                                title={channel.name}
                            >
                                <span className="text-lg font-bold"><img src={`/ch/${channel.logo}`} /></span>
                            </button>
                        ))}
                    </div>
                </div>
            </aside>
        )
    }

    return (
        <aside className="w-80 h-full bg-card border-l border-border flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-foreground">ערוצים</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onToggleCollapse}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="חיפוש ערוץ..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pr-10 bg-secondary border-border"
                    />
                </div>
            </div>

            {/* Category Filter */}
            <div className="p-3 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">סינון לפי קטגוריה</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {categories.map((category) => (
                        <Button
                            key={category}
                            variant={selectedCategory === category ? "default" : "outline"}
                            size="sm"
                            onClick={() => onCategoryChange(category)}
                            className={cn(
                                "text-xs h-7 px-2",
                                selectedCategory === category && "bg-primary text-primary-foreground"
                            )}
                        >
                            {category}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Channels List */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto styled-scrollbar">
                <div className="p-2">
                    {channels.length > 0 ? (
                        <div className="space-y-1">
                            {channels.map((channel) => (
                                <button
                                    key={channel.id}
                                    onClick={() => onSelectChannel(channel)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-lg transition-all text-right",
                                        "hover:bg-secondary",
                                        selectedChannel?.id === channel.id
                                            ? "bg-primary/15 border border-primary"
                                            : "bg-transparent border border-transparent"
                                    )}
                                >
                                    {/* Logo */}
                                    <div className={cn(
                                        "w-12 h-12 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                                        "bg-secondary border border-border",
                                        selectedChannel?.id === channel.id && "border-primary"
                                    )}>
                                        <span className="text-xl font-bold"><img src={`/ch/${channel.logo}`} /></span>
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className={cn(
                                            "font-semibold text-foreground truncate",
                                            selectedChannel?.id === channel.id && "text-primary"
                                        )}>
                                            {channel.name}
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                            <ProgramDisplay program={channel.programs?.[0]} />
                                        </p>
                                    </div>


                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-sm text-muted-foreground">לא נמצאו ערוצים</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-border">
                <p className="text-xs text-muted-foreground text-center">
                    {channels.length} ערוצים זמינים
                </p>
            </div>
        </aside>
    )
}
