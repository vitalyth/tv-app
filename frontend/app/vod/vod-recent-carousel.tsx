"use client";

import { Play } from "lucide-react";
import { HorizontalCarousel } from "@/components/horizontal-carousel";
import { type VodItem, type VodPlaybackMeta } from "@/lib/channels-data";
import { getVodProgressPercent } from "@/lib/vod-progress";

const recentCarouselItemClassName = "w-[58vw] max-w-[13.5rem] shrink-0 sm:w-[12rem] lg:w-[13rem]";

type VodNode = {
  name: string;
  module: string;
  mode: number;
  url: string;
  logo: string;
  moreData: string;
  description?: string;
};

type RecentItem = {
  item: VodItem;
  stack: VodNode[];
  watchedAt: number;
};

export function VodRecentCarousel({
  items,
  buildMeta,
  getImageSrc,
  onPlay,
}: {
  items: RecentItem[];
  buildMeta: (item: VodItem, stack: VodNode[]) => VodPlaybackMeta;
  getImageSrc: (logo: string) => string;
  onPlay: (item: VodItem, stack: VodNode[]) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mb-8">
      <HorizontalCarousel itemClassName={recentCarouselItemClassName}>
        {items.map(({ item, stack }) => {
          const meta = buildMeta(item, stack);
          const progressPercent = getVodProgressPercent(item.id);
          const title = meta.episodeName || item.name;
          const subtitle = [meta.channelName, meta.programName !== title ? meta.programName : null, meta.seasonName]
            .filter(Boolean)
            .join(" · ");

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPlay(item, stack)}
              className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <div className="relative aspect-video overflow-hidden bg-background">
                <img
                  src={getImageSrc(meta.episodeImage || meta.programImage || item.logo)}
                  alt=""
                  className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/15 to-transparent" />
                <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  <Play className="h-3 w-3 fill-current" />
                  המשך
                </span>
                {progressPercent > 0 && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-hidden="true">
                    <div className="h-full bg-primary" style={{ width: `${progressPercent}%` }} />
                  </div>
                )}
              </div>
              <div className="min-w-0 p-3">
                {subtitle && <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>}
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-foreground">{title}</h3>
                {meta.episodeDescription && (
                  <p className="mt-1.5 line-clamp-1 text-xs leading-5 text-muted-foreground">
                    {meta.episodeDescription}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </HorizontalCarousel>
    </section>
  );
}
