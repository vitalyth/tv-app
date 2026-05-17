"use client";

import { useEffect, useState } from "react";
import { Channel } from "@/lib/channels-data";

const RECENTLY_VIEWED_KEY = "recently_viewed_channels";
const MAX_RECENTLY_VIEWED = 10;

type RecentlyViewedItem = {
  id: string;
  timestamp: number;
};

export function useRecentlyViewed(channels: Channel[]) {
  const [recentlyViewed, setRecentlyViewed] = useState<Channel[]>([]);

  const loadRecentlyViewed = () => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!stored) {
      setRecentlyViewed([]);
      return;
    }

    try {
      const items = JSON.parse(stored) as RecentlyViewedItem[];
      const validItems = items
        .filter((item) => channels.find((ch) => ch.id === item.id))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_RECENTLY_VIEWED);

      const viewed = validItems
        .map((item) => channels.find((ch) => ch.id === item.id))
        .filter((channel): channel is Channel => Boolean(channel));

      setRecentlyViewed(viewed);
    } catch (error) {
      console.error("Failed to load recently viewed channels:", error);
      setRecentlyViewed([]);
    }
  };

  useEffect(() => {
    loadRecentlyViewed();

    if (typeof window === "undefined") return;

    window.addEventListener("recently-viewed-updated", loadRecentlyViewed);
    return () => window.removeEventListener("recently-viewed-updated", loadRecentlyViewed);
  }, [channels]);

  const addToRecentlyViewed = (channel: Channel) => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(RECENTLY_VIEWED_KEY);
    let items: RecentlyViewedItem[] = [];

    if (stored) {
      try {
        items = JSON.parse(stored) as RecentlyViewedItem[];
      } catch (error) {
        console.error("Failed to parse recently viewed:", error);
      }
    }

    items = items.filter((item) => item.id !== channel.id);
    items.unshift({ id: channel.id, timestamp: Date.now() });
    items = items.slice(0, MAX_RECENTLY_VIEWED);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(items));

    setRecentlyViewed(
      items
        .map((item) => channels.find((ch) => ch.id === item.id))
        .filter((channel): channel is Channel => Boolean(channel))
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
