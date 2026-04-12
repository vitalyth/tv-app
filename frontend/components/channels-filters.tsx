"use client";

import { Search } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/channels-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
    searchQuery: string;
    setSearchQuery: (value: string) => void;
    selectedCategory: string;
    setSelectedCategory: (value: string) => void;
    onRefresh: () => void;
};

export const ChannelsFilters = ({
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    onRefresh,
}: Props) => {
    return (
        <div className="flex flex-col sm:flex-row gap-4 mb-2">
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
                <Button
                    variant={
                        selectedCategory === "" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setSelectedCategory("")}
                    className="whitespace-nowrap"
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
                        className="whitespace-nowrap"
                    >
                        {label}
                    </Button>
                ))}
            </div>

            {/* reload channels */}
            <Button onClick={onRefresh} variant="outline">רענן</Button>
        </div>
    );
};