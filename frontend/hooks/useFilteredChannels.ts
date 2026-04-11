import { useMemo } from "react";
import { Channel } from "@/lib/channels-data";

export const useFilteredChannels = ( channels: Channel[], searchQuery: string, selectedCategory: string ) => {
  return useMemo(() => {
        const query = searchQuery.toLowerCase();

        return channels.filter((channel) => {
            const matchesSearch = channel.name.toLowerCase().includes(query);
            const matchesCategory =
                selectedCategory === "" ||
                channel.category === selectedCategory;

            return matchesSearch && matchesCategory;
        });
  }, [channels, searchQuery, selectedCategory]);
};