"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import { ChevronLeft, Clapperboard, Library, Play, Search, Star } from "lucide-react";

import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { PageMain } from "@/components/page-main";
import { localSeriesService, type LocalSeries, type LocalSeriesResponse } from "@/lib/services/local-series-service";

const getSeriesTitle = (series: LocalSeries) => {
  return series.metadata?.name || series.title || "ללא שם";
};

const getSeriesImage = (series: LocalSeries) => {
  return series.metadata?.poster || series.metadata?.backdrop || "";
};

const getEpisodeCountText = (count: number) => {
  if (count === 1) return "פרק אחד";
  return `${count} פרקים`;
};

const PAGE_SIZE = 48;

export default function LocalSeriesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const {
    data: pages,
    isLoading,
    isValidating,
    error,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<LocalSeriesResponse>((pageIndex, previousPageData) => {
    if (previousPageData && !previousPageData.hasMore) return null;

    return {
      query: searchQuery,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    };
  }, (params) => localSeriesService.getSeries(params), {
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

  const openSeries = (item: LocalSeries) => {
    router.push(`/local-series/${encodeURIComponent(item.id)}`);
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
      <div className="shrink-0 border-b border-border bg-background px-4 pb-4 pt-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
              <Library className="h-6 w-6 text-primary" />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-foreground">סדרות מקומיות</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <span>סדרות מתוך הספרייה המקומית שלך, עם מידע ותמונות מ-TMDB</span>
              </div>
            </div>
          </div>

          <DebouncedSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="חיפוש סדרות"
          />
        </div>
      </div>

      <PageMain>
        <div className="flex-1 px-4 pb-6 mt-5">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-72 animate-pulse rounded-lg border border-border bg-card" />
              ))}
            </div>
          ) : error ? (
            <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center">
              <p className="text-base font-medium text-red-500">שגיאה בטעינת הסדרות המקומיות</p>
              <button onClick={() => mutate()} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">
                נסה שוב
              </button>
            </div>
          ) : visibleSeries.length === 0 ? (
            <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-base font-medium text-foreground">לא נמצאו סדרות</p>
              <p className="mt-1 text-sm text-muted-foreground">נסה חיפוש אחר או ודא שהספרייה נסרקת ב-backend.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleSeries.map((item) => {
                const title = getSeriesTitle(item);
                const image = getSeriesImage(item);
                const genres = item.metadata?.genres?.slice(0, 2) || [];
                const episodeCount = item.episodes?.length || 0;

                return (
                  <button
                    key={item.id}
                    onClick={() => openSeries(item)}
                    className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <div className="relative aspect-video overflow-hidden bg-background">
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
                        {getEpisodeCountText(episodeCount)}
                      </div>
                    </div>

                    <div className="min-w-0 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-base font-semibold text-foreground">{title}</h3>
                          {item.metadata?.rating ? (
                            <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Star className="h-3.5 w-3.5 fill-current text-primary" />
                              {item.metadata.rating.toFixed(1)}
                            </div>
                          ) : null}
                        </div>
                        <ChevronLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
                      </div>

                      {genres.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {genres.map((genre) => (
                            <span key={genre} className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                              {genre}
                            </span>
                          ))}
                        </div>
                      )}

                      {item.metadata?.overview && (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {item.metadata.overview}
                        </p>
                      )}
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
