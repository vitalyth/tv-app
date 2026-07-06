import { useMemo } from "react";
import { Channel } from "@/lib/channels-data";

export const useFilteredChannels = ( channels: Channel[], searchQuery: string, selectedCategory: string ) => {
  return useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return channels.filter((channel) => {
            const matchesSearch =
                !query ||
                channel.name.toLowerCase().includes(query) ||
                channel.programs.some((program) =>
                    program.name.toLowerCase().includes(query) ||
                    (program.description || "").toLowerCase().includes(query)
                );
            const matchesCategory =
                selectedCategory === "" ||
                channel.category === selectedCategory;

            return matchesSearch && matchesCategory;
        });
  }, [channels, searchQuery, selectedCategory]);
};
