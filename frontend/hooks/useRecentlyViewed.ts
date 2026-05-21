"use client";

import { useEffect, useState } from "react";
import { Channel } from "@/lib/channels-data";

const RECENTLY_VIEWED_KEY = "recently_viewed_channels";
const MAX_RECENTLY_VIEWED = 10;

type RecentlyViewedItem = {
  id: string;
  timestamp: number;
};

const loadRecentlyViewedItems = (): RecentlyViewedItem[] => {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as RecentlyViewedItem[];
  } catch (error) {
    console.error("Failed to load recently viewed channels:", error);
    return [];
  }
};

const saveRecentlyViewedItems = (items: RecentlyViewedItem[]) => {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event("recently-viewed-updated"));
  } catch (error) {
    console.error("Failed to save recently viewed channels:", error);
  }
};

export const addRecentlyViewedChannel = (channelId: string) => {
  if (typeof window === "undefined") return;

  const items = loadRecentlyViewedItems().filter((item) => item.id !== channelId);
  items.unshift({ id: channelId, timestamp: Date.now() });
  saveRecentlyViewedItems(items.slice(0, MAX_RECENTLY_VIEWED));
};

export function useRecentlyViewed(channels: Channel[]) {
  const [recentlyViewed, setRecentlyViewed] = useState<Channel[]>([]);

  const loadRecentlyViewed = () => {
    if (typeof window === "undefined") return;

    const items = loadRecentlyViewedItems()
      .filter((item) => channels.find((ch) => ch.id === item.id))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RECENTLY_VIEWED);

    const viewed = items
      .map((item) => channels.find((ch) => ch.id === item.id))
      .filter((channel): channel is Channel => Boolean(channel));

    setRecentlyViewed(viewed);
  };

  useEffect(() => {
    loadRecentlyViewed();

    if (typeof window === "undefined") return;

    window.addEventListener("recently-viewed-updated", loadRecentlyViewed);
    return () => window.removeEventListener("recently-viewed-updated", loadRecentlyViewed);
  }, [channels]);

  const addToRecentlyViewed = (channel: Channel) => {
    if (typeof window === "undefined") return;

    addRecentlyViewedChannel(channel.id);
    loadRecentlyViewed();
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
