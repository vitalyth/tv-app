"use client";

import { type ReactNode } from "react";
import { Play } from "lucide-react";

import { HorizontalCarousel } from "@/components/horizontal-carousel";
import { type VodItem, type VodPlaybackMeta } from "@/lib/channels-data";
import { getGridImageSrc } from "@/lib/image-urls";
import { getVodProgressPercent } from "@/lib/vod-progress";

export type VodCarouselNode = {
  name: string;
  module: string;
  mode: number;
  url: string;
  logo: string;
  moreData: string;
  description?: string;
};

export type VodCarouselItem = {
  item: VodItem;
  stack: VodCarouselNode[];
  watchedAt?: number;
};

type VodContentCarouselProps = {
  items: VodCarouselItem[];
  title: string;
  actionLabel: string;
  showProgress: boolean;
  compact?: boolean;
  action?: ReactNode;
  buildMeta: (item: VodItem, stack: VodCarouselNode[]) => VodPlaybackMeta;
  getImageSrc: (logo: string) => string;
  onPlay: (item: VodItem, stack: VodCarouselNode[]) => void;
};

const compactItemClassName =
  "w-[58vw] max-w-[13.5rem] shrink-0 sm:w-[12rem] lg:w-[13rem]";

function VodContentCarousel({
  items,
  title,
  actionLabel,
  showProgress,
  compact = false,
  action,
  buildMeta,
  getImageSrc,
  onPlay,
}: VodContentCarouselProps) {
  if (items.length === 0) return null;

  return (
    <section className={compact ? "mb-8 space-y-4" : "space-y-4"}>
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground sm:text-xl">{title}</h2>
        {action}
      </div>

      <HorizontalCarousel itemClassName={compact ? compactItemClassName : undefined}>
        {items.map(({ item, stack }) => {
          const meta = buildMeta(item, stack);
          const itemTitle = meta.episodeName || item.name;
          const subtitle = [
            meta.channelName,
            meta.programName !== itemTitle ? meta.programName : null,
            meta.seasonName,
          ]
            .filter(Boolean)
            .join(" · ");
          const progressPercent = showProgress ? getVodProgressPercent(item.id) : 0;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPlay(item, stack)}
              className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <div className="relative aspect-video overflow-hidden bg-background">
                <img
                  src={getGridImageSrc(getImageSrc(meta.episodeImage || meta.programImage || item.logo))}
                  alt=""
                  className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/15 to-transparent" />
                <span
                  className={`absolute right-2 inline-flex items-center gap-1 rounded-full bg-black/70 text-white ${
                    compact ? "bottom-1.5 px-1.5 py-0.5 text-[10px]" : "bottom-2 px-2 py-1 text-xs"
                  }`}
                >
                  <Play className={compact ? "h-3 w-3 fill-current" : "h-3.5 w-3.5 fill-current"} />
                  {actionLabel}
                </span>
                {progressPercent > 0 && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-hidden="true">
                    <div className="h-full bg-primary" style={{ width: `${progressPercent}%` }} />
                  </div>
                )}
              </div>

              <div className={compact ? "min-w-0 p-3" : "min-w-0 p-4"}>
                {subtitle && <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>}
                <h3
                  className={
                    compact
                      ? "mt-1 line-clamp-2 text-sm font-semibold leading-5 text-foreground"
                      : "mt-1 line-clamp-2 text-base font-semibold text-foreground"
                  }
                >
                  {itemTitle}
                </h3>
                {meta.episodeDescription && (
                  <p
                    className={
                      compact
                        ? "mt-1.5 line-clamp-1 text-xs leading-5 text-muted-foreground"
                        : "mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground"
                    }
                  >
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

type NamedVodCarouselProps = Omit<
  VodContentCarouselProps,
  "title" | "actionLabel" | "showProgress"
>;

export function NewVodCarousel(props: NamedVodCarouselProps) {
  return (
    <VodContentCarousel
      {...props}
      title="חדש ב-VOD"
      actionLabel="נגן"
      showProgress={false}
    />
  );
}

export function ContinueWatchingVodCarousel(props: NamedVodCarouselProps) {
  return (
    <VodContentCarousel
      {...props}
      title="המשך צפייה"
      actionLabel="המשך"
      showProgress
    />
  );
}
