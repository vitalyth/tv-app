"use client";

import { useEffect, useState } from "react";
import { VodItem } from "@/lib/channels-data";

const VOD_RECENT_KEY = "vod_recently_watched";
const MAX_RECENT_VOD_ITEMS = 10;

export interface VodRecentItem {
  item: VodItem;
  stack: Array<{
    name: string;
    module: string;
    mode: number;
    url: string;
    logo: string;
    moreData: string;
    description?: string;
  }>;
  watchedAt: number;
}

export function useVodRecentlyWatched() {
  const [recentItems, setRecentItems] = useState<VodRecentItem[]>([]);

  const loadRecentItems = () => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(VOD_RECENT_KEY);
    if (!stored) {
      setRecentItems([]);
      return;
    }

    try {
      const items: VodRecentItem[] = JSON.parse(stored);
      const sorted = [...items]
        .sort((a, b) => b.watchedAt - a.watchedAt)
        .slice(0, MAX_RECENT_VOD_ITEMS);

      setRecentItems(sorted);
    } catch (error) {
      console.error("Failed to load recent VOD items:", error);
      setRecentItems([]);
    }
  };

  useEffect(() => {
    loadRecentItems();

    if (typeof window === "undefined") return;

    window.addEventListener("vod-recently-watched-updated", loadRecentItems);
    return () => {
      window.removeEventListener("vod-recently-watched-updated", loadRecentItems);
    };
  }, []);

  return { recentItems };
}
