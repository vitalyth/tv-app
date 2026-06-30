"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/channels-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
    searchQuery: string;
    setSearchQuery: (value: string) => void;
    selectedCategory: string;
    setSelectedCategory: (value: string) => void;
    onRefresh: () => void | Promise<unknown>;
};

export const ChannelsFilters = ({
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    onRefresh,
}: Props) => {
    const categoryScrollRef = useRef<HTMLDivElement>(null);
    const [scrollHint, setScrollHint] = useState({
        left: false,
        right: false,
    });
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);

        try {
            await onRefresh();
        } finally {
            window.setTimeout(() => setIsRefreshing(false), 250);
        }
    };

    const updateScrollHint = useCallback(() => {
        const el = categoryScrollRef.current;
        if (!el) return;

        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll <= 1) {
            setScrollHint({ left: false, right: false });
            return;
        }

        const direction = window.getComputedStyle(el).direction;
        const scrollLeft = el.scrollLeft;
        let left = false;
        let right = false;

        if (direction === "rtl" && scrollLeft < 2) {
            left = Math.abs(scrollLeft) < maxScroll - 1;
            right = scrollLeft < -1;
        } else {
            left = scrollLeft > 1;
            right = scrollLeft < maxScroll - 1;
        }

        setScrollHint((current) =>
            current.left === left && current.right === right
                ? current
                : { left, right }
        );
    }, []);

    useEffect(() => {
        updateScrollHint();

        const el = categoryScrollRef.current;
        if (!el) return;

        const resizeObserver = new ResizeObserver(updateScrollHint);
        resizeObserver.observe(el);

        window.addEventListener("resize", updateScrollHint);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", updateScrollHint);
        };
    }, [updateScrollHint]);

    return (
        <div className="flex min-h-0 flex-row items-center justify-between gap-2">
            <div className="relative w-36 shrink-0 sm:min-w-60 sm:flex-1 sm:max-w-md">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="חפש ערוץ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pr-10 text-xs bg-card border-border sm:h-9 sm:text-sm"
                />
            </div>

            <div className="flex min-w-0 flex-1 gap-2 sm:justify-start">
                <Button
                    onClick={handleRefresh}
                    size="sm"
                    disabled={isRefreshing}
                    className="h-8 shrink-0 whitespace-nowrap px-2 text-xs bg-emerald-600 text-white hover:bg-emerald-500 sm:h-9 sm:px-3 sm:text-sm"
                >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    רענן
                </Button>

                <div className="relative min-w-0 flex-1">
                    {scrollHint.left && (
                        <div
                            className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 flex w-10 items-center justify-start bg-gradient-to-r from-background via-background/85 to-transparent text-muted-foreground"
                            aria-hidden="true"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </div>
                    )}
                    {scrollHint.right && (
                        <div
                            className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 flex w-10 items-center justify-end bg-gradient-to-l from-background via-background/85 to-transparent text-muted-foreground"
                            aria-hidden="true"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </div>
                    )}
                    <div
                        ref={categoryScrollRef}
                        onScroll={updateScrollHint}
                        className="overflow-x-auto scrollbar-hide"
                    >
                        <div className="flex w-max gap-2">
                            <Button
                                variant={
                                    selectedCategory === "" ? "default" : "outline"
                                }
                                size="sm"
                                onClick={() => setSelectedCategory("")}
                                className="h-8 whitespace-nowrap px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
                            >
                                הכל
                            </Button>
                            {[...CATEGORY_LABELS.entries()].map(([key, label]) => (
                                <Button
                                    key={key}
                                    variant={
                                        selectedCategory === key ? "default" : "outline"
                                    }
                                    size="sm"
                                    onClick={() => setSelectedCategory(key)}
                                    className="h-8 whitespace-nowrap px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
