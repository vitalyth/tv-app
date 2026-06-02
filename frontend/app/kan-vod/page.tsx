"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import { ChevronLeft, Clapperboard, Play, RefreshCw, Search, Tv } from "lucide-react";

import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { PageMain } from "@/components/page-main";
import { kanVodService, type KanVodSeries, type KanVodSeriesResponse } from "@/lib/services/kan-vod-service";

const getEpisodeCountText = (count: number) => {
  if (count === 0) return "טרם נסרק";
  if (count === 1) return "פרק אחד";
  return `${count} פרקים`;
};

const getSeriesImage = (series: KanVodSeries) => series.image || "/ch/vod.jpg";
const PAGE_SIZE = 48;

export default function KanVodPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const {
    data: pages,
    isLoading,
    isValidating,
    error,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<KanVodSeriesResponse>((pageIndex, previousPageData) => {
    if (previousPageData && !previousPageData.hasMore) return null;

    return {
      query: searchQuery,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    };
  }, (params) => kanVodService.getSeries(params), {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  const visibleSeries = useMemo(() => pages?.flatMap((page) => page.series || []) || [], [pages]);
  const lastPage = pages?.[pages.length - 1];
  const hasMore = Boolean(lastPage?.hasMore);
  const isLoadingMore = Boolean(
    isValidating && pages && pages.length > 0 && pages[pages.length - 1]?.offset === (size - 1) * PAGE_SIZE
  );

  useEffect(() => {
    setSize(1);
  }, [searchQuery, setSize]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSize((currentSize) => currentSize + 1);
        }
      },
      { rootMargin: "320px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, setSize, visibleSeries.length]);

  const refresh = async () => {
    setIsRefreshing(true);

    try {
      await setSize(1);
      await mutate(
        async () => [
          await kanVodService.getSeries({
            refresh: true,
            query: searchQuery,
            limit: PAGE_SIZE,
            offset: 0,
          }),
        ],
        { revalidate: false }
      );
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 250);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
      <div className="mb-5 shrink-0 border-b border-border bg-background px-4 pb-4 pt-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
              <Tv className="h-6 w-6 text-primary" />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-foreground">כאן VOD</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <button
                  type="button"
                  onClick={() => router.push("/vod")}
                  className="rounded px-1 transition-colors hover:bg-secondary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  VOD
                </button>
                <ChevronLeft className="h-3 w-3 text-muted-foreground/70" />
                <span className="rounded bg-secondary px-1 font-medium text-foreground">
                  כאן VOD
                </span>
              </div>
            </div>
          </div>

          <div className="flex w-full gap-2 lg:w-[30rem]">
            <DebouncedSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="חיפוש בכאן"
              className="relative min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
              title="רענון"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      <PageMain>
        <div className="flex-1 px-4 pb-6">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, index) => (
                <div key={index} className="h-72 animate-pulse rounded-lg border border-border bg-card" />
              ))}
            </div>
          ) : error ? (
            <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center">
              <p className="text-base font-medium text-red-500">שגיאה בטעינת כאן VOD</p>
              <button onClick={() => mutate()} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">
                נסה שוב
              </button>
            </div>
          ) : visibleSeries.length === 0 ? (
            <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-base font-medium text-foreground">לא נמצאו סדרות</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {visibleSeries.map((item) => {
                const image = getSeriesImage(item);

                return (
                  <button
                    key={item.id}
                    onClick={() => router.push(`/kan-vod/${encodeURIComponent(item.id)}`)}
                    className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <div className="relative aspect-[2/3] overflow-hidden bg-background">
                      {image ? (
                        <img
                          src={image}
                          alt=""
                          className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <Clapperboard className="h-10 w-10 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
                      <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-xs text-white">
                        <Play className="h-3.5 w-3.5" />
                        {getEpisodeCountText(item.episodeCount)}
                      </div>
                    </div>

                    <div className="min-w-0 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</h3>
                        <ChevronLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
                      </div>
                      {item.description ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}
                      {item.program_genre ? (
                        <div className="mt-3 inline-flex max-w-full rounded-full border border-border bg-background/60 px-2 py-1 text-[11px] text-muted-foreground">
                          <span className="truncate">{item.program_genre}</span>
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {!isLoading && !error && visibleSeries.length > 0 ? (
            <div ref={loadMoreRef} className="flex h-16 items-center justify-center">
              {hasMore || isLoadingMore ? (
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {lastPage?.total ? `${visibleSeries.length} מתוך ${lastPage.total}` : null}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </PageMain>
    </div>
  );
}
