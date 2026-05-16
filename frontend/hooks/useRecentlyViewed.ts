"use client";

import { useEffect, useState } from "react";
import { Channel } from "@/lib/channels-data";

const RECENTLY_VIEWED_KEY = "recently_viewed_channels";
const MAX_RECENTLY_VIEWED = 10;

interface RecentlyViewedItem {
  id: string;
  timestamp: number;
}

export function useRecentlyViewed(channels: Channel[]) {
  const [recentlyViewed, setRecentlyViewed] = useState<Channel[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(RECENTLY_VIEWED_KEY);
    if (stored) {
      try {
        const items: RecentlyViewedItem[] = JSON.parse(stored);
        // Filter to only channels that still exist, sort by timestamp desc
        const validItems = items
          .filter((item) => channels.find((ch) => ch.id === item.id))
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_RECENTLY_VIEWED);

        const viewed = validItems
          .map((item) => channels.find((ch) => ch.id === item.id)!)
          .filter(Boolean);

        setRecentlyViewed(viewed);
      } catch (e) {
        console.error("Failed to load recently viewed channels:", e);
      }
    }
  }, [channels]);

  const addToRecentlyViewed = (channel: Channel) => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(RECENTLY_VIEWED_KEY);
    let items: RecentlyViewedItem[] = [];

    if (stored) {
      try {
        items = JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse recently viewed:", e);
      }
    }

    // Remove if already exists
    items = items.filter((item) => item.id !== channel.id);

    // Add to front
    items.unshift({ id: channel.id, timestamp: Date.now() });

    // Keep only top MAX
    items = items.slice(0, MAX_RECENTLY_VIEWED);

    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(items));
    setRecentlyViewed(
      items
        .map((item) => channels.find((ch) => ch.id === item.id)!)
        .filter(Boolean)
    );
  };

  const clearRecentlyViewed = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(RECENTLY_VIEWED_KEY);
    setRecentlyViewed([]);
  };

  return {
    recentlyViewed,
    addToRecentlyViewed,
    clearRecentlyViewed,
  };
}
